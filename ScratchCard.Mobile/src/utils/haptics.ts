type HapticsModule = {
  selectionAsync?: () => Promise<void>;
  impactAsync?: (style: any) => Promise<void>;
  notificationAsync?: (type: any) => Promise<void>;
  ImpactFeedbackStyle?: { Light: any; Medium: any; Heavy: any };
  NotificationFeedbackType?: { Success: any; Warning: any; Error: any };
};

let mod: HapticsModule | null = null;
try {
  mod = require("expo-haptics") as HapticsModule;
} catch {
  mod = null;
}

function safe(promise: Promise<unknown> | undefined) {
  if (!promise) return;
  promise.catch(() => {
    // Haptics are best-effort.
  });
}

export const haptics = {
  selection: () => {
    safe(mod?.selectionAsync?.());
  },
  light: () => {
    safe(mod?.impactAsync?.(mod?.ImpactFeedbackStyle?.Light));
  },
  medium: () => {
    safe(mod?.impactAsync?.(mod?.ImpactFeedbackStyle?.Medium));
  },
  heavy: () => {
    safe(mod?.impactAsync?.(mod?.ImpactFeedbackStyle?.Heavy));
  },
  success: () => {
    safe(mod?.notificationAsync?.(mod?.NotificationFeedbackType?.Success));
  },
  warning: () => {
    safe(mod?.notificationAsync?.(mod?.NotificationFeedbackType?.Warning));
  },
  error: () => {
    safe(mod?.notificationAsync?.(mod?.NotificationFeedbackType?.Error));
  },
};
