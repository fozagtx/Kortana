'use client';

import React, { createContext, useContext } from 'react';
import { Translations, translations } from './i18n';

interface I18nContextValue {
  language: 'en';
  t: Translations;
}

const I18nContext = createContext<I18nContextValue>({
  language: 'en',
  t: translations.en,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  return (
    <I18nContext.Provider value={{ language: 'en', t: translations.en }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
