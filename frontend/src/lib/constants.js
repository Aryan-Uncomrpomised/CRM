export const CLASSIFICATIONS = [
  { value: "visitor", label: "Visitor" },
  { value: "prospect", label: "Prospect" },
  { value: "prime_prospect", label: "Prime Prospect" },
  { value: "customer", label: "Customer" },
  { value: "subscriber", label: "Subscriber" },
];

export const CATEGORIES = [
  { value: "b2c", label: "B2C", desc: "V-Fresh B2C & D2C shoppers" },
  { value: "b2b", label: "B2B", desc: "V-Fresh B2B & Wholesale" },
  { value: "investor", label: "Investor", desc: "Angel or VC" },
  { value: "fund", label: "Fund", desc: "PE / Growth fund" },
];

export const ODOO_TAGS = [
  "V-Fresh B2C",
  "V-Fresh B2B",
  "CAC-Instagram",
  "CAC-Whatsapp",
  "CAC-Word of Mouth",
  "CAC-Outdoor Advt.",
  "CAC-Tapri",
  "CAC-Roots POS #00002",
  "CAC-Linked In",
  "CAC-Gather",
  "CAC-Outreach",
  "CAC-Gather-Collab",
  "V-Gather",
  "V-Grow",
  "PCA-Kids",
  "PCA-B2BCollab",
  "MSME",
  "Vendor",
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
