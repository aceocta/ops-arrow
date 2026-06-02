import Constants from "expo-constants";
import { navigateToTemperatureLogs } from "../navigation/navigationRef";

// Matches NotificationType.TemperatureLogReminder.ToString() sent in the FCM data payload.
const TEMPERATURE_LOG_REMINDER_TYPE = "TemperatureLogReminder";

function routeFromNotificationData(data?: Record<string, string | object> | null) {
  if (!data) {
    return;
  }
  const notificationType = String((data as Record<string, unknown>).notificationType ?? "");
  if (notificationType === TEMPERATURE_LOG_REMINDER_TYPE) {
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
  let unsubscribe: (() => void) | undefined;

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

      unsubscribe = messaging().onNotificationOpenedApp((remoteMessage) => {
        routeFromNotificationData(remoteMessage?.data);
      });

      const initialMessage = await messaging().getInitialNotification();
      if (initialMessage && !cancelled) {
        routeFromNotificationData(initialMessage.data);
      }
    } catch {
      // Native module not linked/available — deep-link-on-tap simply won't run in this build.
    }
  })();

  return () => {
    cancelled = true;
    unsubscribe?.();
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
