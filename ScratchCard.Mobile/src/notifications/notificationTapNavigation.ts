import Constants from "expo-constants";
import { navigateToTemperatureLogs } from "../navigation/navigationRef";
import { toastInfo } from "../components/toast";

// Match NotificationType.*.ToString() values sent in the FCM data payload. The hourly reminder,
// the missed-check alert, and the predictive (trending-toward-breach) alert all deep-link to the
// Temperature Log screen.
const TEMPERATURE_LOG_TYPES = new Set([
  "TemperatureLogReminder",
  "TemperatureMissedLog",
  "TemperaturePredictiveAlert",
]);

function routeFromNotificationData(data?: Record<string, string | object> | null) {
  if (!data) {
    return;
  }
  const notificationType = String((data as Record<string, unknown>).notificationType ?? "");
  if (TEMPERATURE_LOG_TYPES.has(notificationType)) {
    navigateToTemperatureLogs();
  }
}

/**
 * Registers handlers that deep-link a tapped push notification to the right screen.
 * - onNotificationOpenedApp: user tapped while the app was backgrounded.
 * - getInitialNotification: app was launched from a cold start by tapping the notification.
 * Returns a cleanup function. No-ops in Expo Go / when Firebase messaging isn't available.
 */
export function registerNotificationTapNavigation(): () => void {
  let cancelled = false;
  const unsubscribers: Array<() => void> = [];

  // Firebase's native module (RNFBAppModule) is absent in Expo Go and in dev builds without the
  // native config — calling messaging() there throws. Skip entirely in those runtimes.
  if (isExpoGoRuntime()) {
    return () => {};
  }

  void (async () => {
    const messagingModule = await loadFirebaseMessagingAsync();
    if (!messagingModule || cancelled) {
      return;
    }

    try {
      const messaging = messagingModule.default;

      // Tap from background → deep-link.
      unsubscribers.push(
        messaging().onNotificationOpenedApp((remoteMessage) => {
          routeFromNotificationData(remoteMessage?.data);
        }),
      );

      // Foreground: FCM does not display notification messages while the app is open, so surface
      // an in-app toast instead. (No notifee/expo-notifications installed → no OS banner here.)
      unsubscribers.push(
        messaging().onMessage((remoteMessage) => {
          if (cancelled) {
            return;
          }
          const title = remoteMessage?.notification?.title ?? undefined;
          const body =
            remoteMessage?.notification?.body ??
            (remoteMessage?.data?.body as string | undefined) ??
            "";
          if (body || title) {
            toastInfo(body || (title as string), body ? title : undefined);
          }
        }),
      );

      // App launched from quit state by tapping the notification.
      const initialMessage = await messaging().getInitialNotification();
      if (initialMessage && !cancelled) {
        routeFromNotificationData(initialMessage.data);
      }
    } catch {
      // Native module not linked/available — push handling simply won't run in this build.
    }
  })();

  return () => {
    cancelled = true;
    for (const unsub of unsubscribers) {
      unsub();
    }
  };
}

async function loadFirebaseMessagingAsync() {
  try {
    return await import("@react-native-firebase/messaging");
  } catch {
    return null;
  }
}

function isExpoGoRuntime() {
  return Constants.executionEnvironment === "storeClient" || Constants.appOwnership === "expo";
}
