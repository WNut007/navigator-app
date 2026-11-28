import React, { createContext, useState, useContext, useEffect, useMemo, ReactNode } from 'react';
import { getLangNameFromCode } from 'language-name-map';
import { navigatorConfig } from '../utils';
import { getAvailableLocales } from '../utils/localize';
import localeEmoji from 'locale-emoji';
import useStorage, { storage } from '../hooks/use-storage';
import I18n from 'react-native-i18n';

I18n.fallbacks = true;
I18n.defaultLocale = 'en';
I18n.translations = {
    ...getAvailableLocales(),
};

interface LanguageContextProps {
    locale: string;
    setLocale: (locale: string) => void;
    t: (key: string, options?: Record<string, any>) => string;
}

const LanguageContext = createContext<LanguageContextProps>({
    locale: 'en',
    setLocale: () => {},
    t: () => '',
});

// ShipCode: Thai became the default after drivers had installed the English build; switch an
// existing install to Thai once (the driver can still choose English afterwards)
const LOCALE_MIGRATION_KEY = '_shipcode_locale_v1';
try {
    if (!storage.getString(LOCALE_MIGRATION_KEY)) {
        storage.set('_locale', navigatorConfig('defaultLocale', 'th'));
        storage.set(LOCALE_MIGRATION_KEY, 'done');
    }
} catch (error) {
    // storage not ready: the normal default applies
}

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
    const [locale, setLocaleState] = useStorage<string>('_locale', navigatorConfig('defaultLocale', 'th'));

    const languages = Object.keys(I18n.translations).map((code) => {
        return { code, ...getLangNameFromCode(code), emoji: localeEmoji(code) };
    });

    const language = useMemo(() => {
        return { code: locale, ...getLangNameFromCode(locale), emoji: localeEmoji(locale) };
    }, [locale]);

    // tr()/t() read I18n.locale during render: set it before the first render, not in an effect
    I18n.locale = locale;

    const setLocale = (newLocale: string) => {
        I18n.locale = newLocale;
        setLocaleState(newLocale);
    };

    useEffect(() => {
        I18n.locale = locale;
    }, []);

    const t = (key: string, options?: Record<string, any>) => I18n.t(key, options);

    // Re-mount the app below on a language change so every screen (incl. ones that build their labels
    // once, like the dashboard and tab bar) renders in the new language
    return (
        <LanguageContext.Provider value={{ locale, setLocale, t, current: language, language, languages }}>
            <React.Fragment key={locale}>{children}</React.Fragment>
        </LanguageContext.Provider>
    );
};

export const useLanguage = () => {
    return useContext(LanguageContext);
};
