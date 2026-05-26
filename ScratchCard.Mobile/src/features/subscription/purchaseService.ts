import * as WebBrowser from "expo-web-browser";
import { createBillingCheckoutSession } from "../../api/subscriptionApi";
import { reportError } from "../../utils/crashReporter";
import { track } from "../../utils/analytics";

/**
 * App-to-Web billing flow.
 *
 * Payments happen in the external browser via Stripe Checkout (not in-app). When the user picks
 * a plan we:
 *   1. Ask the backend to create a Stripe Checkout Session scoped to (shopId, planId).
 *   2. Open the returned URL in the device's default browser via expo-web-browser. The session
 *      lives outside the app's sandbox so we are not subject to App Store / Play IAP rules,
 *      Apple/Google commissions, or the "one Apple ID = one subscription" constraint.
 *   3. Stripe processes the payment and notifies RevenueCat. RevenueCat forwards the unified
 *      event to /api/shop-subscription/revenuecat-webhook, which activates the ShopSubscription.
 *   4. When the user returns to the app, useEntitlements refetches and the shop unlocks.
 *
 * This module intentionally exposes no native IAP — there is no react-native-purchases /
 * react-native-iap usage anywhere.
 */

export type StartCheckoutResult = {
  ok: boolean;
  message?: string;
  cancelled?: boolean;
};

export async function startBillingCheckout(args: { shopId: string; planId: string }): Promise<StartCheckoutResult> {
  try {
    const session = await createBillingCheckoutSession(args.shopId, args.planId);
    if (!session?.url) {
      return { ok: false, message: "Checkout session returned no URL." };
    }

    track("checkout_session_created", { shopId: args.shopId, planId: args.planId, provider: session.provider });

    // `openBrowserAsync` keeps the user in an in-app browser sheet on iOS (SFSafariViewController)
    // / Custom Tabs on Android. They can dismiss back to the app naturally; entitlements refetch
    // on app focus so the unlock is immediate.
    const result = await WebBrowser.openBrowserAsync(session.url, {
      dismissButtonStyle: "close",
      showTitle: true,
    });

    if (result.type === "cancel" || result.type === "dismiss") {
      track("checkout_dismissed", { shopId: args.shopId, planId: args.planId });
      return { ok: true, cancelled: true };
    }

    return { ok: true };
  } catch (error: any) {
    reportError(error, { phase: "start-billing-checkout", shopId: args.shopId, planId: args.planId });
    track("checkout_failed", { shopId: args.shopId, planId: args.planId, reason: error?.message });
    return { ok: false, message: error?.response?.data?.message ?? error?.message ?? "Unable to open checkout." };
  }
}

/**
 * "Restore" in the App-to-Web model means asking the backend to recheck entitlements. The actual
 * subscription is on the web; there's nothing to restore from the device's IAP wallet.
 *
 * Callers should also invalidate ["shop-subscription-summary"] and ["shop-entitlements"]
 * queries so the UI flips immediately.
 */
export async function refreshEntitlementsFromBackend(): Promise<StartCheckoutResult> {
  // No-op on this layer. Entitlement freshness is owned by React Query (useEntitlements) and
  // the foreground-refresh effect on mobile. Kept here so existing callers can stay symmetrical
  // with previous "restore" call sites.
  return { ok: true };
}
