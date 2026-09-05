import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { i18n } from '../../next-i18next.config';
import en from '../../public/locales/en/common.json';
import hi from '../../public/locales/hi/common.json';

i18next
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    ...i18n,
    defaultNS: 'common',
    fallbackLng: i18n.defaultLocale,
    resources: {
      en: { common: en },
      hi: { common: hi },
    },
  });

export default i18next;