import AsyncStorage from "@react-native-async-storage/async-storage";
import { Appearance } from "react-native";
import type { ThemeMode } from "./theme";

const THEME_MODE_STORAGE_KEY = "ops_arrow_theme_mode";
const THEME_MODE_GLOBAL_KEY = "__opsArrowThemeMode";

function normalizeThemeMode(value: string | null | undefined): ThemeMode {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "light" || normalized === "dark" || normalized === "system") {
    return normalized;
  }

  return "system";
}

function getDefaultThemeModeFromEnv() {
  return normalizeThemeMode(process.env.EXPO_PUBLIC_THEME_MODE);
}

function setRuntimeThemeMode(mode: ThemeMode) {
  (globalThis as any)[THEME_MODE_GLOBAL_KEY] = mode;
}

export function applyThemeModeToAppearance(mode: ThemeMode) {
  setRuntimeThemeMode(mode);
  Appearance.setColorScheme(mode === "system" ? "unspecified" : mode);
}

export async function getStoredThemeModePreference() {
  try {
    const storedValue = await AsyncStorage.getItem(THEME_MODE_STORAGE_KEY);
    if (storedValue == null) {
      return getDefaultThemeModeFromEnv();
    }

    return normalizeThemeMode(storedValue);
  } catch {
    return getDefaultThemeModeFromEnv();
  }
}

export async function setStoredThemeModePreference(mode: ThemeMode) {
  const normalizedMode = normalizeThemeMode(mode);
  await AsyncStorage.setItem(THEME_MODE_STORAGE_KEY, normalizedMode);
  applyThemeModeToAppearance(normalizedMode);
  return normalizedMode;
}

export async function bootstrapThemeModePreference() {
  const preferredMode = await getStoredThemeModePreference();
  applyThemeModeToAppearance(preferredMode);
  return preferredMode;
}
