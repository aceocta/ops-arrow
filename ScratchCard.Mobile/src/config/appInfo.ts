import Constants from "expo-constants";

const defaultAppName = "Ops Arrow";

function resolveAppName() {
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
  const configuredName = typeof extra.appDisplayName === "string" ? extra.appDisplayName.trim() : "";
  return configuredName || defaultAppName;
}

const appName = resolveAppName();

export const appInfo = {
  name: appName,
  loginTitle: `${appName} Sign In`,
};

/**
 * URL of the web platform (where shops are created / company billing is managed). Read from
 * expoConfig.extra.webAppUrl; returns null when not configured so callers can fall back to a
 * plain "use the web" message instead of rendering a dead link.
 */
export function resolveWebPlatformUrl(): string | null {
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
  const raw = typeof extra.webAppUrl === "string" ? extra.webAppUrl.trim() : "";
  return raw || null;
}
