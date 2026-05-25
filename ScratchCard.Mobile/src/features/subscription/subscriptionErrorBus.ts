// A tiny event bus so the axios client can report subscription-related 403s without importing
// React Navigation / UI code (which would create a cycle and break the client at startup).
// `installSubscriptionErrorHandler` is called once from RootNavigator and wires the navigator + toast.

export type SubscriptionErrorKind = "feature_not_in_plan" | "user_seat_limit_reached" | "subscription_expired";

export type SubscriptionErrorPayload = {
  kind: SubscriptionErrorKind;
  message?: string;
  feature?: string;
};

type Handler = (payload: SubscriptionErrorPayload) => void;

let handler: Handler | null = null;

export function installSubscriptionErrorHandler(next: Handler | null) {
  handler = next;
}

export function emitSubscriptionError(payload: SubscriptionErrorPayload) {
  handler?.(payload);
}

const KNOWN_CODES: Record<string, SubscriptionErrorKind> = {
  feature_not_in_plan: "feature_not_in_plan",
  user_seat_limit_reached: "user_seat_limit_reached",
  subscription_expired: "subscription_expired",
};

export function classifySubscriptionError(code: string | undefined): SubscriptionErrorKind | null {
  if (!code) return null;
  return KNOWN_CODES[code] ?? null;
}
