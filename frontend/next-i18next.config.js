module.exports = {
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'hi'],
  },
  localePath: typeof window === 'undefined' ? './public/locales' : '/public/locales',
};