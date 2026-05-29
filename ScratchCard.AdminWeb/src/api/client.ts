import axios from "axios";

const TOKEN_KEY = "adminweb.accessToken";

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 30000,
});

apiClient.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401 the stored token is stale/invalid — drop it so the app falls back to the login screen.
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      setStoredToken(null);
    }
    return Promise.reject(error);
  }
);

export function getApiErrorMessage(error: unknown, fallback: string): string {
  const e = error as any;
  if (e?.response?.data?.message) return e.response.data.message as string;
  if (e?.code === "ERR_NETWORK" || e?.message === "Network Error") {
    return "Couldn't reach the server. Check the API is running and the base URL is correct.";
  }
  return e?.message ?? fallback;
}
