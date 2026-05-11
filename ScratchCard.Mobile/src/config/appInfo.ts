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
