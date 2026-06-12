// Public pricing data, fetched live from the same API the portal uses.
// Responses arrive in the standard { success, data, message } envelope.

export type PlanFeature = {
  name: string;
  description: string | null;
};

export type PlanFeatureCategory = {
  category: string;
  features: PlanFeature[];
};

export type PublicPlan = {
  name: string;
  description: string | null;
  pricePerShop: number;
  currency: string;
  billingCycle: "Monthly" | "Annual" | string;
  trialDays: number | null;
  maxUsers: number | null;
  displayOrder: number;
  featureCategories: PlanFeatureCategory[];
};

type Envelope<T> = {
  success?: boolean;
  data?: T;
  message?: string | null;
};

const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/+$/, "");

// ngrok's free tier serves an HTML interstitial unless this header is present.
// Only send it for ngrok hosts — it is a custom header, so elsewhere it would
// just force an unnecessary CORS preflight.
const defaultHeaders: Record<string, string> = /ngrok/i.test(baseUrl)
  ? { "ngrok-skip-browser-warning": "true" }
  : {};

export async function fetchPublicPlans(signal?: AbortSignal): Promise<PublicPlan[]> {
  const res = await fetch(`${baseUrl}/public/plans`, { headers: defaultHeaders, signal });
  if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
  const body = (await res.json()) as Envelope<PublicPlan[]> | PublicPlan[];
  // Unwrap the { success, data } envelope (or accept a bare array).
  const data = Array.isArray(body) ? body : body?.data;
  if (!Array.isArray(data)) throw new Error("Unexpected response shape");
  return [...data].sort((a, b) => a.displayOrder - b.displayOrder);
}

export const gbp = (n: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n || 0);

export const cycleSuffix = (cycle: string) =>
  cycle === "Annual" ? "/year per shop" : "/month per shop";
