export const CLASSIFICATIONS = [
  { value: "visitor", label: "Visitor" },
  { value: "prospect", label: "Prospect" },
  { value: "prime_prospect", label: "Prime Prospect" },
  { value: "customer", label: "Customer" },
  { value: "subscriber", label: "Subscriber" },
];

export const CATEGORIES = [
  { value: "consumer", label: "Consumer", desc: "D2C shopper" },
  { value: "odoo", label: "Odoo Store Customers", desc: "Simplability Odoo SaaS (2,164 contacts)" },
  { value: "b2b", label: "B2B", desc: "Wholesale / retailer" },
  { value: "investor", label: "Investor", desc: "Angel or VC" },
  { value: "fund", label: "Fund", desc: "PE / Growth fund" },
];

export const TASK_STATUS = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "waiting", label: "Waiting" },
  { value: "done", label: "Done" },
];

export const TASK_PRIORITY = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

export const CHANNEL_META = {
  email: { label: "Email", color: "#38bdf8" },
  sms: { label: "SMS", color: "#facc15" },
  whatsapp: { label: "WhatsApp", color: "#34d399" },
};

export const EVENT_LABELS = {
  visit: "Site visit",
  add_to_cart: "Added to cart",
  address_added: "Address added",
  payment_attempt: "Payment initiated",
  order_completed: "Order completed",
  subscription_started: "Subscription started",
  subscription_renewed: "Subscription renewed",
};

export function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function fmtDateTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function relTime(iso) {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  const diff = (Date.now() - then) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
