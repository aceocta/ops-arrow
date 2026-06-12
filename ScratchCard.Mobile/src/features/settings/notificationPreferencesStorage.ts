import AsyncStorage from "@react-native-async-storage/async-storage";

// Storage key scheme for per-shop notification channel preferences. Kept in its own module (rather
// than inside NotificationPreferencesScreen) so AuthContext can clear the preferences on sign-out
// without importing a screen component (which would create an import cycle via useAuth).
export const NOTIFICATION_PREFS_STORAGE_PREFIX = "notif-prefs:v1:";

/**
 * Removes the locally stored notification preferences for every shop. Called on sign-out so the
 * next user on a shared shop device starts from the defaults rather than the previous user's
 * channel choices.
 */
export async function clearAllNotificationPreferences() {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const prefKeys = allKeys.filter((key) => key.startsWith(NOTIFICATION_PREFS_STORAGE_PREFIX));
    if (prefKeys.length > 0) {
      await AsyncStorage.multiRemove(prefKeys);
    }
  } catch {
    // best-effort
  }
}
