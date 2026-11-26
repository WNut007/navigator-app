import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import socketClusterClient from 'socketcluster-client';
import { EventRegister } from 'react-native-event-listeners';
import { storage } from '../hooks/use-storage';
import { consumeAsyncIterator } from '../utils';
import { useConfig } from './ConfigContext';

const SocketClusterContext = createContext(null);

/**
 * SocketClusterProvider component that initializes the socket connection
 * and provides socket-related functionalities to its children.
 */
export const SocketClusterProvider = ({ children }) => {
    const { resolveConnectionConfig } = useConfig();
    const [socket, setSocket] = useState(null);
    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState(null);
    // Resolves once the socket has tried to sign in for this session (subscriptions wait for it)
    const authReadyRef = useRef<Promise<void>>(Promise.resolve());
    // Channels the screens want; re-subscribed after the socket signs in again (token renewal,
    // server kick-out on expiry, app back in the foreground)
    const wantedChannelsRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        // Initialize the socket connection
        const options = {
            hostname: resolveConnectionConfig('SOCKETCLUSTER_HOST'),
            port: resolveConnectionConfig('SOCKETCLUSTER_PORT'),
            path: resolveConnectionConfig('SOCKETCLUSTER_PATH'),
            secure: resolveConnectionConfig('SOCKETCLUSTER_SECURE'),
        };

        const scSocket = socketClusterClient.create(options);

        // ShipCode: with socket auth on, channels are only open to a signed socket token.
        // The driver gets one from /driver/v1/socket/token; it lets them subscribe to their own
        // channels (driver, vehicle, assigned orders). 404 means socket auth is off: stay anonymous.
        let refreshTimer = null;
        let disposed = false;
        let tokenExpiresAt = 0;

        const resubscribeWanted = () => {
            wantedChannelsRef.current.forEach((name) => {
                if (!scSocket.isSubscribed(name, true)) {
                    scSocket.subscribe(name);
                }
            });
        };
        const authenticate = async () => {
            clearTimeout(refreshTimer);
            const sessionToken = storage.getString('_driver_token');
            const host = resolveConnectionConfig('FLEETBASE_HOST');

            if (!sessionToken || !host) {
                if (scSocket.authState === 'authenticated') {
                    await scSocket.deauthenticate().catch(() => {});
                }
                return;
            }

            try {
                const response = await fetch(`${host}/driver/v1/socket/token`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${sessionToken}`, Accept: 'application/json', 'User-Agent': 'shipcode-driver-app' },
                });
                if (!response.ok) {
                    return;
                }

                const { token, expires_in } = await response.json();
                if (disposed || !token) return;
                await scSocket.authenticate(token);
                tokenExpiresAt = Date.now() + Number(expires_in || 300) * 1000;
                resubscribeWanted();

                // Renew before it expires (socket tokens are short-lived)
                const refreshInMs = Math.max(30, Number(expires_in || 300) * 0.8) * 1000;
                refreshTimer = setTimeout(() => {
                    authReadyRef.current = authenticate();
                }, refreshInMs);
            } catch (err) {
                console.warn('[Socket] could not sign in to the socket server:', err?.message ?? err);
            }
        };

        // JS timers don't run while the app is in the background, so the renewal can be missed:
        // the server then kicks the channels out (token_expired). Sign in again and resubscribe.
        const kickOutListener = scSocket.listener('kickOut');
        const stopKickOut = consumeAsyncIterator(
            kickOutListener,
            () => {
                authReadyRef.current = authenticate();
            },
            () => {}
        );
        const appStateSubscription = AppState.addEventListener('change', (state) => {
            if (state === 'active' && storage.getString('_driver_token') && Date.now() > tokenExpiresAt - 60000) {
                authReadyRef.current = authenticate();
            }
        });

        // Sign in again whenever the driver session changes (login / logout)
        const driverListener = EventRegister.addEventListener('driver.updated', () => {
            authReadyRef.current = authenticate();
        });

        // Define handlers for socket events
        const handleConnect = () => {
            setIsConnected(true);
            console.log('Socket connected.');
            authReadyRef.current = authenticate();
        };

        const handleDisconnect = () => {
            setIsConnected(false);
            console.log('Socket disconnected.');
        };

        const handleError = (err) => {
            setError(err);
            console.warn('Socket encountered error:', err);
        };

        // Attach event listeners using AsyncIterator
        const connectListener = scSocket.listener('connect');
        const disconnectListener = scSocket.listener('disconnect');
        const errorListener = scSocket.listener('error');

        // Start consuming the AsyncIterators
        const stopConnect = consumeAsyncIterator(connectListener, handleConnect, handleError);
        const stopDisconnect = consumeAsyncIterator(disconnectListener, handleDisconnect, handleError);
        const stopError = consumeAsyncIterator(errorListener, handleError, handleError);

        setSocket(scSocket);

        // Cleanup on unmount
        return () => {
            // Stop all iterations
            stopConnect();
            stopDisconnect();
            stopError();
            disposed = true;
            clearTimeout(refreshTimer);
            stopKickOut();
            appStateSubscription?.remove?.();
            if (typeof driverListener === 'string') EventRegister.removeEventListener(driverListener);

            scSocket.disconnect();
            console.log('Socket connection closed.');
        };
    }, []);

    /**
     * Subscribes to a specific channel.
     * @param {string} channelName - The name of the channel to subscribe to.
     * @returns {Channel|null} The subscribed channel instance or null if subscription fails.
     */
    const subscribeChannel = useCallback(
        async (channelName) => {
            if (!socket) {
                console.warn('Socket not initialized.');
                return null;
            }

            try {
                // Wait (up to 5 s) for the socket to sign in, else the server refuses the channel
                await Promise.race([authReadyRef.current?.catch?.(() => {}), new Promise((resolve) => setTimeout(resolve, 5000))]);

                wantedChannelsRef.current.add(channelName);
                const channel = socket.subscribe(channelName);
                if (channel.isSubscribed()) {
                    console.log(`Already subscribed to channel "${channelName}".`);
                    return channel;
                }

                await channel.listener('subscribe').once();
                console.log(`Subscribed to channel "${channelName}".`);
                return channel;
            } catch (err) {
                console.warn(`Failed to subscribe to channel "${channelName}":`, err);
                return null;
            }
        },
        [socket]
    );

    /**
     * Closes a specific channel gracefully.
     * @param {string} channelName - The name of the channel to close.
     */
    const closeChannel = useCallback(
        async (channelName) => {
            if (!socket) {
                console.warn('Socket not initialized.');
                return;
            }

            try {
                wantedChannelsRef.current.delete(channelName);
                await socket.closeChannel(channelName);
                console.log(`Gracefully closed channel "${channelName}".`);
            } catch (err) {
                console.warn(`Error while closing channel "${channelName}":`, err);
            }
        },
        [socket]
    );

    /**
     * Forcefully kills a specific channel immediately.
     * @param {string} channelName - The name of the channel to kill.
     */
    const killChannel = useCallback(
        async (channelName) => {
            if (!socket) {
                console.warn('Socket not initialized.');
                return;
            }

            try {
                wantedChannelsRef.current.delete(channelName);
                await socket.killChannel(channelName);
                console.log(`Forcefully killed channel "${channelName}".`);
            } catch (err) {
                console.warn(`Error while killing channel "${channelName}":`, err);
            }
        },
        [socket]
    );

    /**
     * Closes all channels gracefully.
     */
    const closeAllChannels = useCallback(async () => {
        if (!socket) {
            console.warn('Socket not initialized.');
            return;
        }

        try {
            wantedChannelsRef.current.clear();
            await socket.closeAllChannels();
            console.log('Gracefully closed all channels.');
        } catch (err) {
            console.warn('Error while closing all channels:', err);
        }
    }, [socket]);

    /**
     * Forcefully kills all channels immediately.
     */
    const killAllChannels = useCallback(async () => {
        if (!socket) {
            console.warn('Socket not initialized.');
            return;
        }

        try {
            wantedChannelsRef.current.clear();
            await socket.killAllChannels();
            console.log('Forcefully killed all channels.');
        } catch (err) {
            console.warn('Error while killing all channels:', err);
        }
    }, [socket]);

    return (
        <SocketClusterContext.Provider
            value={{
                socket,
                isConnected,
                error,
                subscribeChannel,
                closeChannel,
                killChannel,
                closeAllChannels,
                killAllChannels,
            }}
        >
            {children}
        </SocketClusterContext.Provider>
    );
};

/**
 * Custom hook to access the SocketClusterContext.
 * @returns {Object} The socket context value.
 */
export const useSocketCluster = () => {
    return useContext(SocketClusterContext);
};
