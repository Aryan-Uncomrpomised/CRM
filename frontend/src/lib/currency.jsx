import { createContext, useContext, useCallback } from "react";

const CurrencyContext = createContext(null);

export function CurrencyProvider({ children }) {
  const currency = "INR";

  const toggle = useCallback(() => {}, []);

  // Format all amounts permanently in Indian Rupees (₹)
  const format = useCallback(
    (amountInr, opts = {}) => {
      const v = Number(amountInr) || 0;
      const digits = opts.digits ?? 0;
      const formatted = v.toLocaleString("en-IN", {
        maximumFractionDigits: digits,
        minimumFractionDigits: 0,
      });
      return `₹${formatted}`;
    },
    [],
  );

  return (
    <CurrencyContext.Provider value={{ currency: "INR", toggle, format, symbol: "₹" }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  return useContext(CurrencyContext);
}
