import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { Camera, useCameraDevice, useCodeScanner, useCameraPermission } from 'react-native-vision-camera';
import { tr } from '../utils/tr';

type QrCodeScannerProps = {
    onScan: (data: string) => void;
    width?: number | string;
    height?: number | string;
    overlayStyle?: object;
    scanCooldown?: number; // ms before allowing next scan
};

export const QrCodeScanner: React.FC<QrCodeScannerProps> = ({ onScan, width = '100%', height = '100%', overlayStyle = {}, scanCooldown = 3000 }) => {
    const device = useCameraDevice('back');
    // ShipCode: render the camera only once permission is granted. Before, the camera started while
    // Android's permission dialog was still open, failed, and stayed black until the screen was reopened.
    const { hasPermission, requestPermission } = useCameraPermission();
    const [isScanning, setIsScanning] = useState(true);
    const cooldownRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (!hasPermission) {
            requestPermission().then((granted) => {
                if (!granted) console.warn('Camera permission not granted');
            });
        }

        return () => {
            if (cooldownRef.current) {
                clearTimeout(cooldownRef.current);
            }
        };
    }, []);

    const codeScanner = useCodeScanner({
        codeTypes: ['qr'],
        onCodeScanned: (codes) => {
            if (!isScanning || codes.length === 0) return;

            const scanned = codes[0];
            setIsScanning(false);

            if (typeof onScan === 'function') {
                onScan(scanned, codes);
            }

            cooldownRef.current = setTimeout(() => {
                setIsScanning(true);
            }, scanCooldown);
        },
    });

    if (!hasPermission) {
        return (
            <View style={[styles.noCamera, { width, height }]}>
                <Text style={{ color: '#fff', textAlign: 'center', paddingHorizontal: 24 }}>{tr('Allow camera access to scan the QR code')}</Text>
                <Text style={{ color: '#60a5fa', marginTop: 16 }} onPress={() => requestPermission()}>
                    {tr('Allow camera')}
                </Text>
            </View>
        );
    }

    if (!device) {
        return (
            <View style={[styles.noCamera, { width, height }]}>
                <Text style={{ color: '#fff' }}>{tr("No camera available")}</Text>
            </View>
        );
    }

    return (
        <View style={{ width, height }}>
            <Camera style={StyleSheet.absoluteFill} device={device} isActive={true} codeScanner={codeScanner} />
            <View pointerEvents='none' style={styles.overlayContainer}>
                <View style={[styles.overlayBox, overlayStyle]} />
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    noCamera: {
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#000',
    },
    overlayContainer: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
    },
    overlayBox: {
        width: 150,
        height: 150,
        borderWidth: 3,
        borderStyle: 'dashed',
        borderColor: 'red',
        opacity: 0.75,
    },
});

export default QrCodeScanner;
