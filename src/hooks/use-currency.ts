"use client";

import { useState, useEffect, useCallback } from "react";
import { moneySymbol } from "@/lib/geo/format";
import { roundRewardAmount, rewardFractionDigits } from "@/lib/geo/format";
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
  /** Like formatMoney, but rounds converted figures to clean reward ticks
   * (nearest 5/1/0.25 by magnitude) — league payout displays only. */
  formatRewardMoney: (amountMWK: number) => string;
  convert: (amountMWK: number) => number;
  /** Format a WALLET amount — already in the user's own currency
   *  (local-currency wallets). Raw number + symbol, NO conversion. */
  formatWallet: (amountLocal: number) => string;
  convertFormatted: (amountMWK: number) => string;
  /** Inverse of convert(): local-currency amount -> MWK-equivalent (the
   *  internal ledger unit every wallet/stake/deposit is stored in). Use
   *  this whenever a player TYPES a money amount in their own currency
   *  and it needs to be sent to an API that expects MWK. */
  toMWK: (amountLocal: number) => number;
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
      // Malawian users: no conversion needed, rate is genuinely 1
      if (state.currencyCode === "MWK") {
        return `${state.currencySymbol} ${value.toLocaleString("en-US")}`;
      }
      // Non-Malawian users: only convert once the real rate has loaded.
      // Before that, show the honest MWK amount so we don't mislead by
      // slapping a foreign symbol on an unconverted number (1000 MWK ≠ 1000 ZMW).
      if (!state.loaded || !state.rate || state.rate === 1) {
        return `MK ${value.toLocaleString("en-US")}`;
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
    [state.currencyCode, state.currencySymbol, state.rate, state.loaded],
  );

  const formatRewardMoney = useCallback(
    (amountMWK: number) => {
      const value = Math.floor(amountMWK ?? 0);
      if (state.currencyCode === "MWK") {
        return `${state.currencySymbol} ${value.toLocaleString("en-US")}`;
      }
      // Same honesty gate as formatMoney: no fake conversion before the
      // real rate has loaded.
      if (!state.loaded || !state.rate || state.rate === 1) {
        return `MK ${value.toLocaleString("en-US")}`;
      }
      const rounded = roundRewardAmount(value * state.rate);
      try {
        return new Intl.NumberFormat("en", {
          style: "currency",
          currency: state.currencyCode,
          minimumFractionDigits: rewardFractionDigits(value * state.rate),
          maximumFractionDigits: rewardFractionDigits(value * state.rate),
        }).format(rounded);
      } catch {
        return `${state.currencySymbol} ${rounded.toLocaleString("en-US")}`;
      }
    },
    [state.currencyCode, state.currencySymbol, state.rate, state.loaded],
  );

  const convert = useCallback(
    (amountMWK: number) => {
      if (state.currencyCode === "MWK") return Math.floor(amountMWK ?? 0);
      // Before the rate loads, return the raw MWK amount (not a fake conversion)
      if (!state.loaded || !state.rate || state.rate === 1) return Math.floor(amountMWK ?? 0);
      return Math.round((amountMWK ?? 0) * state.rate);
    },
    [state.currencyCode, state.rate, state.loaded],
  );

  const formatWallet = useCallback(
    (amountLocal: number) => {
      const value = Number(amountLocal ?? 0);
      // Whole wallet amounts format as before; fractional amounts (e.g.
      // an exact 5% withdrawal fee netting K10.45) keep their decimals.
      const shown = Number.isInteger(value)
        ? value.toLocaleString("en-US")
        : value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return `${state.currencySymbol} ${shown}`;
    },
    [state.currencySymbol],
  );

  const convertFormatted = useCallback(
    (amountMWK: number) => convert(amountMWK).toLocaleString("en-US"),
    [convert],
  );

  const toMWK = useCallback(
    (amountLocal: number) => {
      const value = Math.max(0, Math.floor(amountLocal ?? 0));
      if (state.currencyCode === "MWK") return value;
      // Rate hasn't loaded yet — treat as MWK 1:1 rather than guessing.
      // (Matches convert()'s same honesty rule for the pre-load window.)
      if (!state.loaded || !state.rate || state.rate === 1) return value;
      return Math.round(value / state.rate);
    },
    [state.currencyCode, state.rate, state.loaded],
  );

  return { ...state, formatMoney, formatRewardMoney, formatWallet, convert, convertFormatted, toMWK };
}
