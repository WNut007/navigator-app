import React, { useEffect, useState, useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView, Pressable, Keyboard, StyleSheet } from 'react-native';
import { Spinner, Input, Stack, Text, YStack, useTheme, Button } from 'tamagui';
import { toast, ToastPosition } from '@backpackapp-io/react-native-toast';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faRightToBracket, faArrowLeft, faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons';
import { isValidPhoneNumber, navigatorConfig } from '../utils';
import { useAuth } from '../contexts/AuthContext';
import useAppTheme from '../hooks/use-app-theme';
import PhoneInput from '../components/PhoneInput';
import LinearGradient from 'react-native-linear-gradient';
import { tr } from '../utils/tr';

const PhoneLoginScreen = () => {
    const navigation = useNavigation();
    const theme = useTheme();
    const { isDarkMode } = useAppTheme();
    const { loginWithPassword, isVerifyingCode: isSigningIn, phone: phoneState } = useAuth();
    const [phone, setPhone] = useState(phoneState);
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    // ShipCode: sign in with phone + password on the driver API (no SMS code)
    const handleLogin = async () => {
        if (isSigningIn) {
            return;
        }

        if (!isValidPhoneNumber(phone)) {
            return toast.error(tr("Invalid phone number provided."));
        }

        if (!password) {
            return toast.error(tr("Please enter your password."));
        }

        Keyboard.dismiss();
        try {
            await loginWithPassword(phone, password);
            // The navigator switches to the driver screens once the session exists
        } catch (error) {
            toast.error(error.message);
        }
    };

    const handleGoBackHome = () => {
        navigation.goBack();
    };

    const handleCreateAccount = () => {
        navigation.navigate('CreateAccount');
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: navigatorConfig('colors.loginBackground') }}>
            <LinearGradient colors={['rgba(0, 0, 0, 0.0)', 'rgba(0, 0, 0, 0.4)', 'rgba(0, 0, 0, 0.8)']} style={StyleSheet.absoluteFillObject} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} />
            <YStack flex={1} alignItems='center' space='$3'>
                <YStack space='$2' width='100%' px='$5' pt='$5'>
                    <Text color='$gray-200' fontWeight='bold' fontSize='$8' mb='$3'>{tr("Login")}</Text>
                    <PhoneInput value={phone} onChange={(phoneNumber) => setPhone(phoneNumber)} />
                    <Stack position='relative' width='100%'>
                        <Input
                            size='$5'
                            value={password}
                            onChangeText={setPassword}
                            placeholder={tr("Password")}
                            secureTextEntry={!showPassword}
                            autoCapitalize='none'
                            autoCorrect={false}
                            returnKeyType='go'
                            onSubmitEditing={handleLogin}
                            bg='$gray-200'
                            color='$gray-900'
                            borderWidth={0}
                            pr='$7'
                        />
                        <Pressable onPress={() => setShowPassword((value) => !value)} style={{ position: 'absolute', right: 16, top: 0, bottom: 0, justifyContent: 'center' }}>
                            <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} color={theme['$gray-600']?.val ?? '#666'} />
                        </Pressable>
                    </Stack>
                    <Button size='$5' onPress={handleLogin} bg='$primary' width='100%' opacity={isSigningIn ? 0.75 : 1} disabled={isSigningIn} rounded>
                        <Button.Icon>{isSigningIn ? <Spinner color='$white' /> : <FontAwesomeIcon icon={faRightToBracket} color={'#fff'} />}</Button.Icon>
                        <Button.Text color='$white' fontWeight='bold'>{tr("Login")}</Button.Text>
                    </Button>
                </YStack>

                <YStack flex={1} position='relative' width='100%'>
                    <Pressable style={StyleSheet.absoluteFill} onPress={Keyboard.dismiss} pointerEvents='box-only' />
                </YStack>

                <YStack space='$4' width='100%' padding='$5'>
                    <Button size='$5' onPress={handleGoBackHome} bg={isDarkMode ? '$secondary' : '$gray-700'} width='100%' rounded>
                        <Button.Icon>
                            <FontAwesomeIcon icon={faArrowLeft} color={isDarkMode ? theme['textPrimary'].val : theme['$gray-400'].val} />
                        </Button.Icon>
                        <Button.Text color={isDarkMode ? theme['textPrimary'].val : theme['$gray-400'].val} fontWeight='bold'>{tr("Home")}</Button.Text>
                    </Button>
                </YStack>
            </YStack>
        </SafeAreaView>
    );
};

export default PhoneLoginScreen;
