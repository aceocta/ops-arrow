import Constants from "expo-constants";
import { PermissionsAndroid, Platform } from "react-native";

export type FirebaseDevicePushToken = {
  token: string;
  platform: string;
};

export async function resolveFirebasePushTokenAsync(): Promise<FirebaseDevicePushToken | null> {
  if (isExpoGoRuntime()) {
    return null;
  }

  const messagingModule = await loadFirebaseMessagingAsync();
  if (!messagingModule) {
    return null;
  }

  const messaging = messagingModule.default;

  try {
    await messaging().registerDeviceForRemoteMessages();

    if (Platform.OS === "ios") {
      const authStatus = await messaging().requestPermission();
      const hasPermission =
        authStatus === messagingModule.AuthorizationStatus.AUTHORIZED ||
        authStatus === messagingModule.AuthorizationStatus.PROVISIONAL;
      if (!hasPermission) {
        return null;
      }
    } else if (Platform.OS === "android" && typeof Platform.Version === "number" && Platform.Version >= 33) {
      // Android 13 (API 33) introduced the POST_NOTIFICATIONS runtime permission. Without it,
      // FCM tokens still register and the backend's send call still succeeds — but the OS drops
      // the notification on display, so it looks broken with no error anywhere. Request explicitly.
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        return null;
      }
    }

    const token = await messaging().getToken();
    if (typeof token !== "string" || token.trim().length === 0) {
      return null;
    }

    return {
      token: token.trim(),
      platform: "fcm",
    };
  } catch {
    return null;
  }
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
