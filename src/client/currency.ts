import { useState } from "react";

export type Currency = "USD" | "EUR" | "KGS" | "GBP";

const STORAGE_KEY = "odograph:currency";

const CURRENCY_SYMBOLS: Record<Currency, string> = {
  USD: "$",
  EUR: "€",
  KGS: "с",
  GBP: "£",
};

export function currencySymbol(currency: Currency): string {
  return CURRENCY_SYMBOLS[currency];
}

function readStoredCurrency(): Currency {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "EUR" || stored === "KGS" || stored === "GBP" ? stored : "USD";
}

/** Mirrors theme.ts's localStorage-backed pattern — call once, from App.tsx, and thread the
 * resulting symbol down as a prop (research.md: this codebase uses no Context API). */
export function useCurrency(): [Currency, (next: Currency) => void] {
  const [currency, setCurrencyState] = useState<Currency>(readStoredCurrency);

  function setCurrency(next: Currency) {
    localStorage.setItem(STORAGE_KEY, next);
    setCurrencyState(next);
  }

  return [currency, setCurrency];
}
