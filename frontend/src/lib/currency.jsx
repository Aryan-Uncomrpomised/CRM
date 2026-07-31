import { createContext, useContext, useState, useCallback } from "react";

const RATES = { INR: 1, USD: 1 / 83 };
const SYMBOLS = { INR: "₹", USD: "$" };

const CurrencyContext = createContext(null);

export function CurrencyProvider({ children }) {
  const [currency, setCurrency] = useState(() => localStorage.getItem("voyage.currency") || "INR");

  const toggle = useCallback(() => {
    setCurrency((c) => {
      const next = c === "INR" ? "USD" : "INR";
      localStorage.setItem("voyage.currency", next);
      return next;
    });
  }, []);

  // Amounts are stored in Odoo backend in INR (₹); convert on display if USD
  const format = useCallback(
    (amountInr, opts = {}) => {
      const v = (Number(amountInr) || 0) * (RATES[currency] || 1);
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
