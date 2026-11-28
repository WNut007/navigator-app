import I18n from 'react-native-i18n';
import thStrings from '../../translations/th-strings.json';

/**
 * ShipCode: translate a UI string by its English text (gettext style).
 * Thai when the app language is Thai, the English text otherwise or when there's no translation yet.
 * The dictionary is translations/th-strings.json (English → Thai).
 */
const dictionaries: Record<string, Record<string, string>> = { th: thStrings as Record<string, string> };

export function tr(text: string): string {
    const language = String(I18n.locale ?? 'en').split(/[-_]/)[0];
    return dictionaries[language]?.[text] ?? text;
}

export default tr;
