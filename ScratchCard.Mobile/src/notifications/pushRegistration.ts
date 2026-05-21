import Constants from "expo-constants";
import { Platform } from "react-native";

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
