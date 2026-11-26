import { BrowserAdapter } from '@fleetbase/sdk';
import { storage } from '../hooks/use-storage';

/**
 * ShipCode: talks to the driver-scoped API (`/driver/v1`) instead of the public `/v1` API.
 *
 * The driver signs in with their own phone/email + password and gets a token that only works on
 * `/driver/v1` and only sees orders assigned to them. No company API key is needed in the app.
 *
 * The rest of the app (and the Fleetbase SDK models: Driver, Order, ...) still call the `/v1`
 * paths, e.g. `drivers/{id}/track` or `orders/{id}/update-activity`. This adapter translates those
 * calls to the matching `/driver/v1` endpoint, so the screens did not need to change.
 *
 * Endpoints `/driver/v1` doesn't offer (chat, issues, fuel reports, comments, organizations...)
 * answer an empty list for reads and a clear error for writes, instead of a 401/404 from `/v1`.
 */

const MAX_PAGE_SIZE = 50;
const MAX_PAGES = 10;

export class FeatureNotAvailableError extends Error {
    constructor(feature) {
        super(`${feature} is not available in this app yet.`);
        this.name = 'FeatureNotAvailableError';
        this.feature = feature;
    }
}

const trimSlashes = (path) => String(path ?? '').replace(/^\/+|\/+$/g, '');

export default class DriverAppAdapter extends BrowserAdapter {
    constructor({ host, token = null, locale = 'th' } = {}) {
        // BrowserAdapter requires a key: the real token, or a placeholder before login
        super({ publicKey: token || 'driver-app', host, namespace: 'driver/v1' });
        this.token = token;
        this.setHeaders({ Accept: 'application/json', 'Accept-Language': locale, 'User-Agent': 'shipcode-driver-app' });
        if (!token) {
            delete this.headers.Authorization;
        }
    }

    setLocale(locale) {
        this.setHeaders({ 'Accept-Language': locale });
        return this;
    }

    // --- Public adapter API used by the SDK and the app --------------------------------------

    get(path, query = {}, options = {}) {
        return this.route('GET', path, query ?? {}, options);
    }

    post(path, data = {}, options = {}) {
        return this.route('POST', path, data ?? {}, options);
    }

    put(path, data = {}, options = {}) {
        return this.route('PUT', path, data ?? {}, options);
    }

    patch(path, data = {}, options = {}) {
        return this.route('PATCH', path, data ?? {}, options);
    }

    delete(path, options = {}) {
        return this.route('DELETE', path, {}, options);
    }

    // --- Raw calls to /driver/v1 ----------------------------------------------------------------

    /**
     * Reads the session token at request time, not when the client was built: right after login
     * the screens start loading before React has rebuilt the client with the new token.
     */
    request(path, method = 'GET', data = {}, options = {}) {
        let token = null;
        try {
            token = storage.getString('_driver_token') || this.token;
        } catch (error) {
            token = this.token;
        }

        if (token) {
            this.headers = { ...this.headers, Authorization: `Bearer ${token}` };
        } else if (this.headers?.Authorization) {
            const { Authorization, ...rest } = this.headers;
            this.headers = rest;
        }

        return super.request(path, method, data, options);
    }

    send(method, path, data = {}, options = {}) {
        switch (method) {
            case 'GET':
                return super.get(path, data, options);
            case 'POST':
                return super.post(path, data, options);
            case 'PUT':
                return super.put(path, data, options);
            case 'PATCH':
                return super.patch(path, data, options);
            default:
                return super.delete(path, options);
        }
    }

    // --- Translation of /v1 calls ---------------------------------------------------------------

    async route(method, rawPath, data, options) {
        const path = trimSlashes(rawPath);
        const segments = path.split('/');
        const [resource, id, action, subjectId] = segments;

        // Native /driver/v1 paths pass straight through
        if (['auth', 'me', 'socket', 'location', 'locations'].includes(resource)) {
            return this.send(method, path, data, options);
        }

        if (resource === 'drivers') {
            return this.routeDriver(method, id, action, data, options);
        }

        if (resource === 'orders') {
            return this.routeOrder(method, id, action, subjectId, data, options);
        }

        return this.notAvailable(method, resource);
    }

    async routeDriver(method, id, action, data, options) {
        // POST drivers/login {identity, password}
        if (id === 'login' && method === 'POST') {
            if (!data?.password) {
                throw new Error('Please enter your password.');
            }
            const { token, expires_at, driver } = await this.send('POST', 'auth/login', { identity: data.identity, password: data.password }, options);
            // The app keeps the token on the driver record (driver.token), like the /v1 login did
            return { ...driver, token, token_expires_at: expires_at };
        }

        if (['login-with-sms', 'verify-code', 'request-creation-code'].includes(id) || (method === 'POST' && !id)) {
            throw new FeatureNotAvailableError(id === 'request-creation-code' || !id ? 'Creating an account' : 'SMS login');
        }

        if (!action) {
            // GET drivers/{id} (reload) and PUT drivers/{id} (profile/meta edits, not supported yet: no-op)
            return this.send('GET', 'me', {}, options);
        }

        switch (action) {
            case 'track':
                return this.send('POST', 'location', data, options);
            case 'toggle-online':
                return this.send('POST', 'me/online', data, options);
            case 'register-device':
                return this.send('POST', 'me/device', data, options);
            case 'organizations':
                return [];
            case 'current-organization':
                return {};
            default:
                return this.notAvailable(method, `drivers/${action}`);
        }
    }

    async routeOrder(method, id, action, subjectId, data, options) {
        // GET orders?... (the order lists)
        if (!id) {
            if (method !== 'GET') {
                return this.notAvailable(method, 'orders');
            }
            return this.queryOrders(data, options);
        }

        if (!action) {
            if (method !== 'GET') {
                return this.notAvailable(method, 'orders');
            }
            return this.send('GET', `orders/${id}`, {}, options);
        }

        const subject = subjectId ? `/${subjectId}` : '';

        switch (action) {
            case 'next-activity':
                return this.send('GET', `orders/${id}/next`, data?.waypoint ? { waypoint: data.waypoint } : {}, options);

            case 'update-activity': {
                const code = data?.activity?.code ?? (await this.firstNextCode(id, data?.waypoint, options));
                return this.updateActivity(id, code, data, options);
            }

            case 'start': {
                // There is no separate start endpoint: starting is the "started" step of the order flow
                const code = await this.firstNextCode(id, data?.waypoint, options, 'started');
                return this.updateActivity(id, code, data, options);
            }

            case 'capture-signature':
                return this.send('POST', `orders/${id}/proofs/signature${subject}`, { signature: data?.signature, remarks: data?.remarks }, options);

            case 'capture-qr':
                return this.send('POST', `orders/${id}/proofs/qr${subject}`, { code: data?.code }, options);

            case 'capture-photo':
                // /driver/v1 takes photos as data URLs (JSON); the upstream screen sends multipart
                if (typeof FormData !== 'undefined' && data instanceof FormData) {
                    throw new FeatureNotAvailableError('Photo proof of delivery');
                }
                return this.send('POST', `orders/${id}/proofs/photo${subject}`, { photos: data?.photos, remarks: data?.remarks }, options);

            default:
                return this.notAvailable(method, `orders/${action}`);
        }
    }

    async firstNextCode(orderId, waypoint, options, preferredCode = null) {
        const steps = await this.send('GET', `orders/${orderId}/next`, waypoint ? { waypoint } : {}, options);
        const list = Array.isArray(steps) ? steps : [];
        const preferred = preferredCode ? list.find((step) => step?.code === preferredCode) : null;
        const step = preferred ?? list.find((step) => step?.code && step.code !== 'dispatched') ?? list[0];
        if (!step?.code) {
            throw new Error('There is no next step for this order.');
        }
        return step.code;
    }

    updateActivity(orderId, code, data, options) {
        const body = { code };
        if (data?.proof) body.proof_id = typeof data.proof === 'object' ? data.proof.id : data.proof;
        if (data?.waypoint) body.waypoint = data.waypoint;
        return this.send('POST', `orders/${orderId}/activity`, body, options);
    }

    /**
     * The app asks for: active orders (`active`), orders of a calendar day (`on`), recent orders
     * (everything else), and nearby ad-hoc orders (`nearby`/`adhoc`, not offered to drivers here).
     * /driver/v1 has two scopes: active (unfinished) and history (completed/canceled).
     */
    async queryOrders(query = {}, options = {}) {
        if (query.nearby || query.adhoc) {
            return [];
        }

        const scope = query.active || query.on ? 'active' : 'history';
        const wantsAll = !query.limit || Number(query.limit) < 0;
        const limit = wantsAll ? MAX_PAGE_SIZE : Math.min(MAX_PAGE_SIZE, Number(query.limit));

        const orders = [];
        for (let page = 1; page <= MAX_PAGES; page++) {
            const response = await this.send('GET', 'orders', { scope, limit, page }, options);
            const rows = Array.isArray(response) ? response : (response?.data ?? []);
            orders.push(...rows);

            const lastPage = response?.meta?.last_page ?? 1;
            if (!wantsAll || page >= lastPage || rows.length === 0) {
                break;
            }
        }

        if (query.on) {
            // Orders scheduled (or created) on that day, compared on the local calendar date
            const day = String(query.on).slice(0, 10);
            return orders.filter((order) => String(order.scheduled_at ?? order.created_at ?? '').slice(0, 10) === day);
        }

        return orders;
    }

    notAvailable(method, what) {
        // Lists the app loads in the background (chat channels, issues, fuel reports, comments...)
        // come back empty so screens render; actions fail with a clear message.
        if (method === 'GET') {
            return Promise.resolve([]);
        }
        return Promise.reject(new FeatureNotAvailableError(what));
    }
}
