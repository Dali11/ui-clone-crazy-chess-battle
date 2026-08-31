"use client";

import { useState, useEffect, useCallback } from "react";
import { moneySymbol } from "@/lib/geo/format";
import { COUNTRY_CURRENCY, DEFAULT_CURRENCY } from "@/lib/geo/currency-map";

export interface CurrencyState {
  currencyCode: string;
  currencySymbol: string;
  rate: number;
  loaded: boolean;
  countryCode: string | null;
}

export interface UseCurrencyReturn extends CurrencyState {
  formatMoney: (amountMWK: number) => string;
  convert: (amountMWK: number) => number;
  convertFormatted: (amountMWK: number) => string;
}

export function useCurrency(initialCountryCode?: string | null): UseCurrencyReturn {
  // If the caller already knows the user's country (e.g. from SSR props),
  // initialize with the correct currency symbol to avoid a flash of MWK.
  const initialCurrencyCode = initialCountryCode
    ? (COUNTRY_CURRENCY[initialCountryCode.toUpperCase()] || DEFAULT_CURRENCY)
    : DEFAULT_CURRENCY;

  const [state, setState] = useState<CurrencyState>({
    currencyCode: initialCurrencyCode,
    currencySymbol: initialCountryCode ? moneySymbol(initialCountryCode) : "MK",
    rate: 1,
    loaded: false,
    countryCode: initialCountryCode || null,
  });

  useEffect(() => {
    let cancelled = false;
    async function fetchCurrency() {
      try {
        const res = await fetch("/api/currency");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const currencyCode = data.currencyCode || DEFAULT_CURRENCY;
        const countryCode = data.countryCode || null;
        const sym = moneySymbol(countryCode);
        setState({
          currencyCode,
          currencySymbol: sym,
          rate: data.rate || 1,
          loaded: true,
          countryCode,
        });
      } catch {}
    }
    fetchCurrency();
    return () => { cancelled = true; };
  }, []);

  const formatMoney = useCallback(
    (amountMWK: number) => {
      const value = Math.floor(amountMWK ?? 0);
      if (state.currencyCode === "MWK" || !state.rate || state.rate === 1) {
        return `${state.currencySymbol} ${value.toLocaleString("en-US")}`;
      }
      const converted = Math.round(value * state.rate);
      try {
        return new Intl.NumberFormat("en", {
          style: "currency",
          currency: state.currencyCode,
          maximumFractionDigits: 0,
        }).format(converted);
      } catch {
        return `${state.currencySymbol} ${converted.toLocaleString("en-US")}`;
      }
    },
    [state.currencyCode, state.currencySymbol, state.rate],
  );

  const convert = useCallback(
    (amountMWK: number) => {
      if (state.currencyCode === "MWK" || !state.rate || state.rate === 1) return Math.floor(amountMWK ?? 0);
      return Math.round((amountMWK ?? 0) * state.rate);
    },
    [state.currencyCode, state.rate],
  );

  const convertFormatted = useCallback(
    (amountMWK: number) => convert(amountMWK).toLocaleString("en-US"),
    [convert],
  );

  return { ...state, formatMoney, convert, convertFormatted };
}
