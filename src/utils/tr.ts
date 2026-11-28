import I18n from 'react-native-i18n';
import thStrings from '../../translations/th-strings.json';

/**
 * ShipCode: translate a UI string by its English text (gettext style).
 * Thai when the app language is Thai, the English text otherwise or when there's no translation yet.
 * The dictionary is translations/th-strings.json (English → Thai). Placeholders: tr('{n} orders', { n: 3 }).
 */
const dictionaries: Record<string, Record<string, string>> = { th: thStrings as Record<string, string> };

export const isThai = (): boolean => String(I18n.locale ?? 'en').startsWith('th');

export function tr(text: string, vars?: Record<string, string | number>): string {
    const language = String(I18n.locale ?? 'en').split(/[-_]/)[0];
    let result = dictionaries[language]?.[text] ?? text;
    if (vars) {
        for (const [key, value] of Object.entries(vars)) {
            result = result.split(`{${key}}`).join(String(value));
        }
    }
    return result;
}

export default tr;
