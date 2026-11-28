import React from 'react';
import { YStack, Text } from 'tamagui';
import { tr } from '../utils/tr';

/**
 * Keeps a broken map (bad coordinates, native map error) from taking down the
 * whole screen: the card or screen around it keeps working.
 */
export default class MapErrorBoundary extends React.Component<{ children: React.ReactNode; height?: any; width?: any }, { failed: boolean }> {
    state = { failed: false };

    static getDerivedStateFromError() {
        return { failed: true };
    }

    componentDidCatch(error: Error) {
        console.warn('[MapErrorBoundary] map could not render:', error?.message);
    }

    render() {
        if (this.state.failed) {
            return (
                <YStack flex={1} width={this.props.width ?? '100%'} height={this.props.height ?? '100%'} bg='$gray-800' alignItems='center' justifyContent='center'>
                    <Text color='$gray-400' fontSize='$2'>{tr("Map unavailable")}</Text>
                </YStack>
            );
        }

        return this.props.children;
    }
}
