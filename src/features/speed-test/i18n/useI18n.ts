'use client';
import { createContext, useContext } from 'react';
import type { Locale } from './i18n';
import { translate, formatNumber, formatBytes, formatDate } from './i18n';

export type I18nCtxValue = {
  locale: Locale;
  t: (key: string, params?: Record<string, string | number>) => string;
  fmtNum: (value: number | null, digits?: number) => string;
  fmtBytes: (bytes: number | null) => string;
  fmtDate: (iso: string | null) => string;
};

export const I18nContext = createContext<I18nCtxValue>({
  locale: 'pt',
  t: (k) => k,
  fmtNum: (v) => String(v ?? '—'),
  fmtBytes: (v) => String(v ?? '—'),
  fmtDate: (v) => v ?? '—',
});

export function useI18n(): I18nCtxValue {
  return useContext(I18nContext);
}

export function makeI18n(locale: Locale): I18nCtxValue {
  return {
    locale,
    t: (key, params) => translate(locale, key, params),
    fmtNum: (value, digits) => formatNumber(locale, value, digits),
    fmtBytes: (bytes) => formatBytes(locale, bytes),
    fmtDate: (iso) => formatDate(locale, iso),
  };
}
