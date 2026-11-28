import * as dateFns from 'date-fns';
import { th, enUS } from 'date-fns/locale';
import I18n from 'react-native-i18n';

// ShipCode: date-fns with the app language applied (Thai month/day names, C.E. years).
// Every screen imports date functions from here instead of 'date-fns'.
export * from 'date-fns';

const currentLocale = () => (String(I18n.locale ?? 'en').startsWith('th') ? th : enUS);

export function format(date, formatString, options = {}) {
    return dateFns.format(date, formatString, { locale: currentLocale(), ...options });
}

export function formatDistance(date, baseDate, options = {}) {
    return dateFns.formatDistance(date, baseDate, { locale: currentLocale(), ...options });
}

export function formatDistanceToNow(date, options = {}) {
    return dateFns.formatDistanceToNow(date, { locale: currentLocale(), ...options });
}

export function formatRelative(date, baseDate, options = {}) {
    return dateFns.formatRelative(date, baseDate, { locale: currentLocale(), ...options });
}
