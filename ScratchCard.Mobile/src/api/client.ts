import axios, { AxiosError, AxiosRequestConfig } from "axios";
import Constants from "expo-constants";
import { getAccessToken } from "../auth/tokenStorage";
import { classifySubscriptionError, emitSubscriptionError } from "../features/subscription/subscriptionErrorBus";

// Resolve order:
// 1. EXPO_PUBLIC_API_BASE_URL (build-time env var)
// 2. expoConfig.extra.apiBaseUrl (app.json / app.config.js)
// 3. Hardcoded fallback (kept as a last resort so dev still works without env wiring)
const FALLBACK_BASE_URL = "https://gaming-lent-startup.ngrok-free.dev/api";
const envBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
const extraBaseUrl = (Constants.expoConfig?.extra as any)?.apiBaseUrl?.toString().trim();
const configuredBaseUrl = envBaseUrl || extraBaseUrl || FALLBACK_BASE_URL;

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

type RetryableConfig = AxiosRequestConfig & { __retryAttempted?: boolean };

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

    // One transparent retry on transient 5xx / network errors (covers Azure cold-start blips,
    // dropped wifi packets). Only safe for idempotent verbs — POST/PUT/PATCH/DELETE are skipped.
    const config = error.config as RetryableConfig | undefined;
    const status = error.response?.status;
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
