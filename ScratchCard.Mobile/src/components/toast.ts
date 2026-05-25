import { showAppAlert } from "./AppAlert";

type ToastTone = "success" | "info" | "warning" | "danger";

const TITLE_BY_TONE: Record<ToastTone, string> = {
  success: "Success",
  info: "Notice",
  warning: "Notice",
  danger: "Error",
};

export function toast(message: string, tone: ToastTone = "info", title?: string) {
  showAppAlert(title ?? TITLE_BY_TONE[tone], message);
}

export const toastSuccess = (message: string, title?: string) => toast(message, "success", title);
export const toastError = (message: string, title?: string) => toast(message, "danger", title);
export const toastWarning = (message: string, title?: string) => toast(message, "warning", title);
export const toastInfo = (message: string, title?: string) => toast(message, "info", title);
