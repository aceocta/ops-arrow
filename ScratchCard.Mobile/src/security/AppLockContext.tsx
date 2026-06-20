import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState, AppStateStatus } from "react-native";
import { useAuth } from "../auth/AuthContext";
import {
  authenticate,
  getAppLockEnabled,
  getBiometricCapability,
  setAppLockEnabledStored,
} from "./appLock";

type AppLockContextValue = {
  /** User turned App Lock on (persisted, per-device). */
  enabled: boolean;
  /** Device can do biometric/passcode auth — gates whether the Settings toggle is usable. */
  available: boolean;
  /** "Face ID" / "Fingerprint" / "Biometrics" for UI copy. */
  biometricLabel: string;
  /** App is currently locked and should show the lock overlay. */
  locked: boolean;
  /** Prompt to unlock now (used by the overlay). */
  unlock: () => Promise<boolean>;
  /** Turn App Lock on — prompts once to confirm the device can authenticate. Returns success. */
  enableLock: () => Promise<boolean>;
  /** Turn App Lock off. */
  disableLock: () => Promise<void>;
};

const AppLockContext = createContext<AppLockContextValue | undefined>(undefined);

const UNLOCK_PROMPT = "Unlock Ops Arrow";

export function AppLockProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isBootstrapping } = useAuth();

  const [enabled, setEnabled] = useState(false);
  const [available, setAvailable] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState("Biometrics");
  const [locked, setLocked] = useState(false);
  const [prefsReady, setPrefsReady] = useState(false);

  // Refs the AppState listener (set up once) needs to read the latest values.
  const enabledRef = useRef(false);
  const authedRef = useRef(false);
  const isAuthenticatingRef = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const initialLockApplied = useRef(false);

  useEffect(() => { enabledRef.current = enabled; }, [enabled]);
  useEffect(() => { authedRef.current = isAuthenticated; }, [isAuthenticated]);

  // Load the stored preference + device capability once.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [storedEnabled, capability] = await Promise.all([getAppLockEnabled(), getBiometricCapability()]);
      if (cancelled) return;
      setAvailable(capability.available);
      if (capability.label) setBiometricLabel(capability.label);
      // Only honour a stored "enabled" while the device can still authenticate (biometrics may have
      // been removed); otherwise we'd lock the user out with no way in.
      setEnabled(storedEnabled && capability.available);
      setPrefsReady(true);
    })();
    return () => { cancelled = true; };
  }, []);

  // Initial lock: engage exactly once, after both the preference is loaded AND auth bootstrap has
  // finished. This locks a RESTORED session on cold start, but not a fresh in-app login (which
  // happens later, after bootstrapping is already done).
  useEffect(() => {
    if (initialLockApplied.current || !prefsReady || isBootstrapping) return;
    initialLockApplied.current = true;
    if (enabled && isAuthenticated) setLocked(true);
  }, [prefsReady, isBootstrapping, enabled, isAuthenticated]);

  // Signing out clears the lock so it never sits over the login screen.
  useEffect(() => {
    if (!isAuthenticated) setLocked(false);
  }, [isAuthenticated]);

  // Re-lock when the app returns to the foreground from a real background (home / app switch).
  // We lock only on background→active, ignoring the brief "inactive" blips that system sheets and
  // the biometric prompt itself cause — and we skip while a prompt is in flight.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      if (prev === "background" && next === "active") {
        if (enabledRef.current && authedRef.current && !isAuthenticatingRef.current) {
          setLocked(true);
        }
      }
    });
    return () => sub.remove();
  }, []);

  const unlock = useCallback(async () => {
    if (isAuthenticatingRef.current) return false;
    isAuthenticatingRef.current = true;
    try {
      const ok = await authenticate(UNLOCK_PROMPT);
      if (ok) setLocked(false);
      return ok;
    } finally {
      isAuthenticatingRef.current = false;
    }
  }, []);

  const enableLock = useCallback(async () => {
    if (isAuthenticatingRef.current) return false;
    isAuthenticatingRef.current = true;
    try {
      // Confirm the device can actually authenticate before turning it on, so the user can't lock
      // themselves out by enabling it on a device with no usable biometric/passcode.
      const ok = await authenticate("Confirm to turn on App Lock");
      if (!ok) return false;
      setEnabled(true);
      enabledRef.current = true;
      setLocked(false);
      await setAppLockEnabledStored(true);
      return true;
    } finally {
      isAuthenticatingRef.current = false;
    }
  }, []);

  const disableLock = useCallback(async () => {
    setEnabled(false);
    enabledRef.current = false;
    setLocked(false);
    await setAppLockEnabledStored(false);
  }, []);

  const value: AppLockContextValue = {
    enabled,
    available,
    biometricLabel,
    // Only surface "locked" while signed in — the overlay must never cover the login flow.
    locked: locked && enabled && isAuthenticated,
    unlock,
    enableLock,
    disableLock,
  };

  return <AppLockContext.Provider value={value}>{children}</AppLockContext.Provider>;
}

export function useAppLock(): AppLockContextValue {
  const ctx = useContext(AppLockContext);
  if (!ctx) {
    throw new Error("useAppLock must be used within an AppLockProvider");
  }
  return ctx;
}
