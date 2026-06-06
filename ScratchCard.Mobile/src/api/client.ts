import axios, { AxiosError, AxiosRequestConfig } from "axios";
import Constants from "expo-constants";
import { getAccessToken, getRefreshToken, saveAccessToken, saveRefreshToken } from "../auth/tokenStorage";
import { emitSessionExpired } from "../auth/authEvents";
import { classifySubscriptionError, emitSubscriptionError } from "../features/subscription/subscriptionErrorBus";

// Resolve order:
// 1. EXPO_PUBLIC_API_BASE_URL (build-time env var)
// 2. expoConfig.extra.apiBaseUrl (app.json / app.config.js)
// 3. Hardcoded fallback (kept as a last resort so dev still works without env wiring)
const FALLBACK_BASE_URL = "https://wa-ops-arrow-uat-dvdrbjf9fraydwdd.canadacentral-01.azurewebsites.net/api";
// const FALLBACK_BASE_URL = "https://gaming-lent-startup.ngrok-free.dev/api";
const envBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
const extraBaseUrl = (Constants.expoConfig?.extra as any)?.apiBaseUrl?.toString().trim();
const configuredBaseUrl = envBaseUrl || FALLBACK_BASE_URL || extraBaseUrl  ;

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
  // Daily-driver app: a 15s ceiling was too aggressive on cold-starting Azure backends. Raise the
  // global floor; long ops (OCR, AI) override per-call.
  timeout: 30000,
});

apiClient.interceptors.request.use(async (config) => {
  const token = await getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

type RetryableConfig = AxiosRequestConfig & { __retryAttempted?: boolean; __refreshAttempted?: boolean };

// Endpoints where a 401 is expected/terminal and must NOT trigger a token refresh:
// credential checks (login/signup) return 401 for bad credentials, and the refresh/logout calls
// can't themselves be refreshed.
function isAuthFlowEndpoint(url: string | undefined): boolean {
  if (!url) return false;
  return (
    url.includes("/auth/login") ||
    url.includes("/auth/dev-login") ||
    url.includes("/auth/signup") ||
    url.includes("/companies/signup") ||
    url.includes("/auth/refresh-token") ||
    url.includes("/auth/refresh") ||
    url.includes("/auth/logout") ||
    url.includes("/auth/forgot-password") ||
    url.includes("/auth/reset-password")
  );
}

// Single-flight refresh: concurrent 401s share one /auth/refresh-token call rather than each
// firing their own. Uses a bare axios call (not apiClient) to avoid this interceptor + import cycle.
let refreshPromise: Promise<string | null> | null = null;

async function performTokenRefresh(): Promise<string | null> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) {
    return null;
  }
  try {
    const response = await axios.post(`${baseURL}/auth/refresh-token`, { refreshToken }, { timeout: 30000 });
    const payload = (response.data?.data ?? response.data) as
      | { accessToken?: string; AccessToken?: string; refreshToken?: string; RefreshToken?: string }
      | undefined;
    const newAccessToken = payload?.accessToken ?? payload?.AccessToken;
    const newRefreshToken = payload?.refreshToken ?? payload?.RefreshToken;
    if (!newAccessToken) {
      return null;
    }
    await saveAccessToken(newAccessToken);
    if (newRefreshToken) {
      await saveRefreshToken(newRefreshToken);
    }
    return newAccessToken;
  } catch {
    return null;
  }
}

function refreshAccessTokenSingleFlight(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = performTokenRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ code?: string; message?: string }>) => {
    if (error.response?.status === 403) {
      const code = error.response.data?.code;
      const kind = classifySubscriptionError(code);
      if (kind) {
        emitSubscriptionError({
          kind,
          message: error.response.data?.message,
          feature: code === "feature_not_in_plan" ? (error.response.data as any)?.feature : undefined,
        });
      }
    }

    const config = error.config as RetryableConfig | undefined;
    const status = error.response?.status;

    // 401: the access token is missing/expired. Try a one-shot refresh-token exchange, then replay
    // the original request. If refresh fails, the session is unrecoverable → sign the user out.
    if (status === 401 && config && !config.__refreshAttempted && !isAuthFlowEndpoint(config.url)) {
      config.__refreshAttempted = true;
      const newAccessToken = await refreshAccessTokenSingleFlight();
      if (newAccessToken) {
        config.headers = { ...(config.headers as Record<string, string> | undefined), Authorization: `Bearer ${newAccessToken}` };
        return apiClient.request(config);
      }
      emitSessionExpired();
      return Promise.reject(error);
    }

    // One transparent retry on transient 5xx / network errors (covers Azure cold-start blips,
    // dropped wifi packets). Only safe for idempotent verbs — POST/PUT/PATCH/DELETE are skipped.
    const isNetwork = !error.response;
    const isServerSlip = typeof status === "number" && status >= 500 && status <= 599;
    const verb = (config?.method ?? "get").toLowerCase();
    const isIdempotent = verb === "get" || verb === "head" || verb === "options";

    if (config && !config.__retryAttempted && isIdempotent && (isNetwork || isServerSlip)) {
      config.__retryAttempted = true;
      await new Promise<void>((resolve) => {
        setTimeout(() => resolve(), 600);
      });
      return apiClient.request(config);
    }

    return Promise.reject(error);
  }
);
