import { createContext, useContext, useState, useCallback } from "react";

const RATES = { USD: 1, INR: 83 };
const SYMBOLS = { USD: "$", INR: "₹" };

const CurrencyContext = createContext(null);

export function CurrencyProvider({ children }) {
  const [currency, setCurrency] = useState(() => localStorage.getItem("voyage.currency") || "USD");

  const toggle = useCallback(() => {
    setCurrency((c) => {
      const next = c === "USD" ? "INR" : "USD";
      localStorage.setItem("voyage.currency", next);
      return next;
    });
  }, []);

  // Amounts are stored in the backend as USD; convert on display
  const format = useCallback(
    (amountUsd, opts = {}) => {
      const v = (Number(amountUsd) || 0) * RATES[currency];
      const digits = opts.digits ?? (currency === "INR" ? 0 : 2);
      const formatted = v.toLocaleString(undefined, {
        maximumFractionDigits: digits,
        minimumFractionDigits: 0,
      });
      return `${SYMBOLS[currency]}${formatted}`;
    },
    [currency],
  );

  return (
    <CurrencyContext.Provider value={{ currency, toggle, format, symbol: SYMBOLS[currency] }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  return useContext(CurrencyContext);
}
