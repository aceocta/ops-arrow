import AsyncStorage from "@react-native-async-storage/async-storage";

// Whether the user has turned on "App Lock" (biometric / device-PIN gate on top of the session).
// Opt-in and per-device, so existing users aren't suddenly locked out and a shared till device can
// have it on without affecting the owner's phone.
const APP_LOCK_ENABLED_KEY = "ops_arrow_app_lock_enabled";

export async function getAppLockEnabled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(APP_LOCK_ENABLED_KEY)) === "true";
  } catch {
    return false;
  }
}

export async function setAppLockEnabledStored(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(APP_LOCK_ENABLED_KEY, enabled ? "true" : "false");
  } catch {
    // Non-fatal: the in-memory preference still applies for this session.
  }
}

export type BiometricCapability = {
  /** Hardware exists AND the user has enrolled a biometric or device passcode we can prompt for. */
  available: boolean;
  /** Friendly name for UI copy: "Face ID", "Touch ID", "Fingerprint", or "Biometrics". */
  label: string;
};

// Dynamically imported so the app still runs in environments where the native module isn't present
// (e.g. Expo Go or before a fresh dev build) — same pattern as the ML Kit scanner.
async function loadLocalAuth(): Promise<any | null> {
  try {
    return await import("expo-local-authentication");
  } catch {
    return null;
  }
}

export async function getBiometricCapability(): Promise<BiometricCapability> {
  const LA = await loadLocalAuth();
  if (!LA) return { available: false, label: "" };
  try {
    const hasHardware = await LA.hasHardwareAsync();
    const enrolled = await LA.isEnrolledAsync();
    if (!hasHardware || !enrolled) return { available: false, label: "" };

    const types = (await LA.supportedAuthenticationTypesAsync()) as number[];
    const AT = LA.AuthenticationType;
    let label = "Biometrics";
    if (AT && types.includes(AT.FACIAL_RECOGNITION)) label = "Face ID";
    else if (AT && types.includes(AT.FINGERPRINT)) label = "Fingerprint";
    else if (AT && types.includes(AT.IRIS)) label = "Iris";
    return { available: true, label };
  } catch {
    return { available: false, label: "" };
  }
}

/**
 * Prompts for biometric auth, falling back to the device passcode/PIN when biometrics fail or
 * aren't enrolled (disableDeviceFallback=false). Returns true only on a confirmed success.
 */
export async function authenticate(promptMessage: string): Promise<boolean> {
  const LA = await loadLocalAuth();
  if (!LA) return false;
  try {
    const result = await LA.authenticateAsync({
      promptMessage,
      // Allow the device passcode/PIN as a fallback so a user without a usable biometric can still
      // get in — and so a failed biometric doesn't trap them.
      disableDeviceFallback: false,
      fallbackLabel: "Use passcode",
      cancelLabel: "Cancel",
    });
    return Boolean(result?.success);
  } catch {
    return false;
  }
}
