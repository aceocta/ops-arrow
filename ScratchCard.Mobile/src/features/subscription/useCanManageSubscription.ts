import { useAuth } from "../../auth/AuthContext";

// Mirrors the backend gate on ShopSubscriptionController (RoleNames.ManagementAndAbove):
// only the active shop's CompanyOwner / Manager, or a global PlatformAdmin, may change billing.
// Cashier / SalesAssistant get a read-only view and a "contact your owner or manager" message.
export const SUBSCRIPTION_MANAGE_RESTRICTED_MESSAGE =
  "Only the shop owner or a manager can change this shop's subscription. Please ask them to update billing.";

export function useCanManageSubscription(): boolean {
  const { profile, activeShop } = useAuth();
  const isPlatformAdmin = profile?.roles?.includes("PlatformAdmin") ?? false;
  const shopRole = activeShop?.role;
  return isPlatformAdmin || shopRole === "CompanyOwner" || shopRole === "Manager";
}
