import { showAppAlert, type AlertTone } from "./AppAlert";

type ToastTone = AlertTone;

const TITLE_BY_TONE: Record<ToastTone, string> = {
  success: "Success",
  info: "Notice",
  warning: "Notice",
  danger: "Error",
};

export function toast(message: string, tone: ToastTone = "info", title?: string) {
  // Pass the tone explicitly so the banner/dialog colour matches the caller's intent instead of being
  // re-guessed from keywords (which previously rendered success toasts info-blue).
  showAppAlert(title ?? TITLE_BY_TONE[tone], message, undefined, undefined, tone);
}

export const toastSuccess = (message: string, title?: string) => toast(message, "success", title);
export const toastError = (message: string, title?: string) => toast(message, "danger", title);
export const toastWarning = (message: string, title?: string) => toast(message, "warning", title);
export const toastInfo = (message: string, title?: string) => toast(message, "info", title);
