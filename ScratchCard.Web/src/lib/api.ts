import axios, { AxiosError, AxiosRequestConfig } from "axios";

// Same backend as the mobile app. Configure via VITE_API_BASE_URL (.env).
const baseURL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || "/api";

const ACCESS_KEY = "oa.web.accessToken";
const REFRESH_KEY = "oa.web.refreshToken";

export const tokens = {
  access: () => localStorage.getItem(ACCESS_KEY),
  refresh: () => localStorage.getItem(REFRESH_KEY),
  set: (access: string, refresh?: string | null) => {
    localStorage.setItem(ACCESS_KEY, access);
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear: () => {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

// `ngrok-skip-browser-warning` bypasses the ngrok free-tier HTML interstitial (ERR_NGROK_6024).
// Only send it when actually pointing at an ngrok host — elsewhere it just forces an
// unnecessary CORS preflight (it's a custom header).
const defaultHeaders: Record<string, string> = /ngrok/i.test(baseURL) ? { "ngrok-skip-browser-warning": "true" } : {};

export const api = axios.create({ baseURL, timeout: 30000, headers: defaultHeaders });

api.interceptors.request.use((config) => {
  const t = tokens.access();
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});

// Unwrap the API's { success, data } envelope (or return the raw body if it isn't wrapped).
export function unwrap<T>(body: any): T {
  return (body?.data ?? body) as T;
}

let onSessionExpired: (() => void) | null = null;
export function setSessionExpiredHandler(fn: () => void) {
  onSessionExpired = fn;
}

const isAuthEndpoint = (url?: string) =>
  !!url && (url.includes("/auth/login") || url.includes("/auth/refresh") || url.includes("/auth/logout"));

let refreshPromise: Promise<string | null> | null = null;

async function doRefresh(): Promise<string | null> {
  const refreshToken = tokens.refresh();
  if (!refreshToken) return null;
  try {
    const res = await axios.post(`${baseURL}/auth/refresh-token`, { refreshToken }, { headers: defaultHeaders });
    const d = unwrap<any>(res.data);
    const access = d?.accessToken ?? d?.token ?? d?.AccessToken;
    if (!access) return null;
    tokens.set(access, d?.refreshToken ?? d?.RefreshToken ?? refreshToken);
    return access;
  } catch {
    return null;
  }
}

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as (AxiosRequestConfig & { __retried?: boolean }) | undefined;
    if (error.response?.status === 401 && original && !original.__retried && !isAuthEndpoint(original.url)) {
      original.__retried = true;
      refreshPromise = refreshPromise ?? doRefresh();
      const newToken = await refreshPromise.finally(() => (refreshPromise = null));
      if (newToken) {
        original.headers = { ...original.headers, Authorization: `Bearer ${newToken}` };
        return api(original);
      }
      tokens.clear();
      onSessionExpired?.();
    }
    return Promise.reject(error);
  },
);

export function apiErrorMessage(error: unknown, fallback = "Something went wrong."): string {
  const e = error as AxiosError<any>;
  return e?.response?.data?.message ?? e?.message ?? fallback;
}
