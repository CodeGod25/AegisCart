"use client";

import { useEffect } from "react";
import { LLMStatusProvider } from "@/lib/context/llm-status-context";
import { I18nextProvider } from "react-i18next";
import { Providers } from "./providers";
import i18n from "@/lib/i18n";

// Set HTML lang attribute based on i18n language
const setHtmlLang = (language: string) => {
  if (typeof window !== 'undefined') {
    document.documentElement.lang = language;
  }
};

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  // Set initial lang on client side
  useEffect(() => {
    setHtmlLang(i18n.language);
    // Also update when language changes
    const onLanguageChange = (lng: string) => {
      setHtmlLang(lng);
    };
    i18n.on('languageChanged', onLanguageChange);
    return () => {
      i18n.off('languageChanged', onLanguageChange);
    };
  }, [i18n.language]);

  return (
    <LLMStatusProvider>
      <I18nextProvider i18n={i18n}>
        <Providers>{children}</Providers>
      </I18nextProvider>
    </LLMStatusProvider>
  );
}