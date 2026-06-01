import { createNavigationContainerRef } from "@react-navigation/native";
import type { RootStackParamList } from "../types/navigation";

// Global navigation ref so non-component code (e.g. push-notification tap handlers) can navigate.
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

// Opens the Temperature Log screen. Tolerates being called before the navigator has mounted
// (cold start from a notification tap) by retrying briefly until the ref is ready.
export function navigateToTemperatureLogs(attempt = 0): void {
  if (navigationRef.isReady()) {
    // Cast to a loose signature: the deeply-nested navigator param types don't infer cleanly here.
    (navigationRef.navigate as (name: string, params?: object) => void)("MainTabs", {
      screen: "MainStack",
      params: { screen: "TemperatureLogs" },
    });
    return;
  }

  if (attempt >= 20) {
    // ~5s of retries; give up rather than loop forever if the user is signed out.
    return;
  }
  setTimeout(() => navigateToTemperatureLogs(attempt + 1), 250);
}
