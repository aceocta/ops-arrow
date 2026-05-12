import axios from "axios";
import Constants from "expo-constants";
import { getAccessToken } from "../auth/tokenStorage";
const configuredBaseUrl =
  // "https://wa-ops-arrow-uat-dvdrbjf9fraydwdd.canadacentral-01.azurewebsites.net/api";
  "https://gaming-lent-startup.ngrok-free.dev/api";
// const configuredBaseUrl =
//   (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ??
//   "http://localhost:5268/api";

function resolveApiBaseUrl(input: string) {
  const normalizedInput = input.trim();

  try {
    const url = new URL(normalizedInput);
    const isLocalHost = url.hostname === "localhost" || url.hostname === "127.0.0.1";

    if (!isLocalHost) {
      return normalizedInput;
    }

    const hostUri = (Constants.expoConfig as any)?.hostUri as string | undefined;
    const hostFromExpo = hostUri?.split(":")[0];

    if (!hostFromExpo || hostFromExpo === "localhost" || hostFromExpo === "127.0.0.1") {
      return input;
    }

    // On physical devices localhost points to the phone itself. Use Expo host IP instead.
    url.hostname = hostFromExpo;
    url.protocol = "http:";
    return url.toString().replace(/\/$/, "");
  } catch {
    return normalizedInput;
  }
}

const baseURL = resolveApiBaseUrl(configuredBaseUrl);

export const resolvedApiBaseUrl = baseURL;

export const apiClient = axios.create({
  baseURL,
  timeout: 15000,
});

apiClient.interceptors.request.use(async (config) => {
  const token = await getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
