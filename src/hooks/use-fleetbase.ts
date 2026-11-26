import { useMemo, useState, useEffect, useCallback } from 'react';
import Fleetbase from '@fleetbase/sdk';
import { useConfig } from '../contexts/ConfigContext';
import useStorage from './use-storage';
import DriverAppAdapter from '../utils/driver-app-adapter';

// ShipCode: every request goes to the driver-scoped API (/driver/v1) with the driver's own token
const createClient = (authToken, host) => new Fleetbase(authToken || 'driver-app', { host, adapter: new DriverAppAdapter({ host, token: authToken || null }) });

const useFleetbase = () => {
    const { resolveConnectionConfig } = useConfig();
    const FLEETBASE_KEY = resolveConnectionConfig('FLEETBASE_KEY');
    const FLEETBASE_HOST = resolveConnectionConfig('FLEETBASE_HOST');

    const [error, setError] = useState<Error | null>(null);
    const [authToken] = useStorage('_driver_token');
    const [fleetbase, setFleetbase] = useState<Fleetbase | null>(createClient(authToken, FLEETBASE_HOST));

    const hasFleetbaseConfig = useCallback(() => {
        // The driver API needs only the server address (no company API key)
        const FLEETBASE_HOST = resolveConnectionConfig('FLEETBASE_HOST');

        return typeof FLEETBASE_HOST === 'string' && FLEETBASE_HOST.length > 0;
    }, [resolveConnectionConfig]);

    useEffect(() => {
        const FLEETBASE_HOST = resolveConnectionConfig('FLEETBASE_HOST');
        const FLEETBASE_KEY = resolveConnectionConfig('FLEETBASE_KEY');

        try {
            // If authToken is present, initialize a new Fleetbase instance with it,
            // otherwise fall back to the default configuration.
            const fleetbase = createClient(authToken, FLEETBASE_HOST);
            setFleetbase(fleetbase);
        } catch (initializationError) {
            setError(initializationError as Error);
        }
    }, [authToken, resolveConnectionConfig]);

    // Memoize the adapter so that its reference only changes when the fleetbase instance updates.
    const adapter = useMemo(() => {
        if (!fleetbase) return null;
        return fleetbase.getAdapter();
    }, [fleetbase, authToken]);

    // Memoize the returned object to prevent unnecessary re-renders.
    const api = useMemo(
        () => ({
            fleetbase,
            adapter,
            error,
            hasFleetbaseConfig,
        }),
        [fleetbase, adapter, error, authToken, hasFleetbaseConfig]
    );

    return api;
};

export default useFleetbase;
