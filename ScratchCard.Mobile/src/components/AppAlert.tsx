import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertButton, AlertOptions, Animated, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ModalBackdropBlur } from "./ModalBackdropBlur";
import { appTheme } from "../ui/theme";

type AlertRequest = {
  title: string;
  message?: string;
  buttons?: AlertButton[];
  options?: AlertOptions;
  hasExplicitButtons?: boolean;
};

type AlertTone = "info" | "success" | "warning" | "danger";

type QueueItem = AlertRequest & {
  id: number;
  buttons: AlertButton[];
  autoCloseMs: number;
};

const nativeAlert = Alert.alert.bind(Alert);
let isPatched = false;
let nextId = 1;
let presenter: ((request: AlertRequest) => void) | null = null;

const SUCCESS_KEYWORDS = [
  "saved",
  "created",
  "updated",
  "opened",
  "reopened",
  "closed",
  "activated",
  "complete",
  "completed",
  "submitted",
  "finalised",
  "finalized",
  "sent",
  "sync complete",
];

const VALIDATION_KEYWORDS = [
  "validation",
  "required",
  "missing",
  "mismatch",
  "not match",
];

const PERMISSION_KEYWORDS = [
  "permission",
  "not allowed",
  "denied",
];

const CONFIRMATION_KEYWORDS = [
  "confirm",
  "confirmation",
  "are you sure",
];

const WARNING_KEYWORDS = [
  "warning",
  "missing",
  "cannot remove",
];

const DANGER_KEYWORDS = [
  "fail",
  "failed",
  "error",
  "cannot",
  "unable",
  "denied",
  "invalid",
  "not found",
];

function toSearchText(parts: Array<string | undefined>) {
  return parts
    .map((value) => (value ?? "").trim().toLowerCase())
    .filter((value) => value.length > 0)
    .join(" | ");
}

function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function normalizeButtons(buttons?: AlertButton[]) {
  if (buttons && buttons.length > 0) {
    return buttons;
  }
  return [{ text: "OK" }];
}

function normalizeTitle(title: string | undefined, message: string | undefined, tone: AlertTone) {
  const rawTitle = (title ?? "").trim();
  const normalizedTitle = rawTitle.toLowerCase();
  const normalizedMessage = (message ?? "").trim().toLowerCase();
  const combined = toSearchText([rawTitle, message]);

  if (includesAny(combined, PERMISSION_KEYWORDS)) {
    return "Permission Required";
  }

  if (includesAny(combined, VALIDATION_KEYWORDS)) {
    return "Validation";
  }

  if (includesAny(combined, CONFIRMATION_KEYWORDS)) {
    return "Confirmation";
  }

  if (tone === "danger") {
    return "Error";
  }

  if (tone === "success") {
    return "Success";
  }

  if (tone === "warning") {
    return "Notice";
  }

  if (!rawTitle.length) {
    return "Notice";
  }

  if (normalizedTitle === "failed" || normalizedTitle === "fail") {
    return "Error";
  }

  if (normalizedTitle === "saved" || normalizedTitle === "created" || normalizedTitle === "updated") {
    return "Success";
  }

  if (!normalizedMessage.length) {
    return rawTitle;
  }

  return rawTitle;
}

function resolveTone(title: string, message?: string): AlertTone {
  const normalized = toSearchText([title, message]);

  if (includesAny(normalized, DANGER_KEYWORDS)) {
    return "danger";
  }

  if (includesAny(normalized, WARNING_KEYWORDS)) {
    return "warning";
  }

  if (includesAny(normalized, SUCCESS_KEYWORDS)) {
    return "success";
  }

  return "info";
}

function resolveAutoCloseMs(request: AlertRequest, tone: AlertTone): number {
  if (request.hasExplicitButtons) {
    return 0;
  }

  if (tone === "danger") {
    return 3600;
  }
  if (tone === "warning") {
    return 3200;
  }
  if (tone === "success") {
    return 2400;
  }
  return 2800;
}

export function showAppAlert(title: string, message?: string, buttons?: AlertButton[], options?: AlertOptions) {
  const tone = resolveTone(title, message);
  const normalizedTitle = normalizeTitle(title, message, tone);
  const hasExplicitButtons = Boolean(buttons && buttons.length > 0);
  const normalizedButtons = normalizeButtons(buttons);

  // iOS can't reliably present our in-app dialog (a root-level <Modal>) on top of a screen-level
  // <Modal> that's already open, so route interactive dialogs (anything with buttons — confirmations,
  // choices) to the native alert on iOS. Toasts (no buttons, auto-dismiss) render as an in-app
  // native-style banner (see ToastBanner) that slides in from the top and auto-hides.
  const mustUseNative = hasExplicitButtons && Platform.OS === "ios";

  if (presenter && !mustUseNative) {
    presenter({
      title: normalizedTitle,
      message,
      buttons,
      options,
      hasExplicitButtons,
    });
    return;
  }

  nativeAlert(normalizedTitle, message, normalizedButtons, options);
}

export function installAppAlertPatch() {
  if (isPatched) {
    return;
  }

  isPatched = true;
  Alert.alert = ((title: string, message?: string, buttons?: AlertButton[], options?: AlertOptions) => {
    showAppAlert(title, message, buttons, options);
  }) as typeof Alert.alert;
}

// Native-style notification banner: slides down from the top, holds for the tone's auto-close
// duration, then slides back up. Tap to dismiss early. Owns its own lifecycle (enter → hold → exit)
// and calls onDismiss when it has fully left, so the queue only advances after the exit animation.
function ToastBanner({
  item,
  tone,
  onDismiss,
}: {
  item: QueueItem;
  tone: AlertTone;
  onDismiss: () => void;
}) {
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      onDismiss();
    };
    Animated.spring(anim, {
      toValue: 1,
      useNativeDriver: true,
      damping: 18,
      stiffness: 190,
      mass: 0.9,
    }).start();
    const hold = item.autoCloseMs > 0 ? item.autoCloseMs : 2600;
    const timer = setTimeout(() => {
      Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }).start(finish);
    }, hold);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  const dismissNow = () => {
    Animated.timing(anim, { toValue: 0, duration: 160, useNativeDriver: true }).start(() => onDismiss());
  };

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [-120, 0] });
  const topOffset = Math.max(insets.top, 12) + 6;

  return (
    <Modal
      visible
      transparent
      animationType="none"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={dismissNow}
    >
      <View pointerEvents="box-none" style={[styles.bannerOverlay, { paddingTop: topOffset }]}>
        <Animated.View
          pointerEvents="box-none"
          style={{ width: "100%", alignItems: "center", opacity: anim, transform: [{ translateY }] }}
        >
          <Pressable style={styles.bannerCard} onPress={dismissNow} accessibilityRole="button">
            <View
              style={[
                styles.toastToneDot,
                tone === "success" && styles.toneSuccess,
                tone === "warning" && styles.toneWarning,
                tone === "danger" && styles.toneDanger,
                tone === "info" && styles.toneInfo,
              ]}
            />
            <View style={styles.toastTextWrap}>
              <Text style={styles.bannerTitle}>{item.title || "Notice"}</Text>
              {item.message ? <Text style={styles.bannerMessage}>{item.message}</Text> : null}
            </View>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

export function AppAlertHost() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const insets = useSafeAreaInsets();
  const current = queue[0];
  const tone = useMemo(() => resolveTone(current?.title ?? "", current?.message), [current?.title, current?.message]);
  const isAutoClose = Boolean(current?.autoCloseMs);
  const showToast = Boolean(current) && isAutoClose;
  const showDialog = Boolean(current) && !isAutoClose;
  const toastBottomOffset = Math.max(22, insets.bottom + appTheme.spacing.md);

  useEffect(() => {
    presenter = (request) => {
      const requestTone = resolveTone(request.title, request.message);
      const normalizedTitle = normalizeTitle(request.title, request.message, requestTone);
      setQueue((prev) => [
        ...prev,
        {
          ...request,
          title: normalizedTitle,
          id: nextId++,
          buttons: normalizeButtons(request.buttons),
          autoCloseMs: resolveAutoCloseMs(request, requestTone),
        },
      ]);
    };

    return () => {
      presenter = null;
    };
  }, []);

  function closeCurrent() {
    const options = current?.options;
    setQueue((prev) => prev.slice(1));
    options?.onDismiss?.();
  }

  function pressButton(button: AlertButton) {
    setQueue((prev) => prev.slice(1));
    button.onPress?.();
  }

  const canDismiss = current?.options?.cancelable ?? true;

  return (
    <>
      {showToast && current ? (
        <ToastBanner key={current.id} item={current} tone={tone} onDismiss={closeCurrent} />
      ) : null}

      <Modal
        visible={showDialog}
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"
        statusBarTranslucent
        onRequestClose={() => {
          if (canDismiss) {
            closeCurrent();
          }
        }}
      >
        <View style={[styles.overlay, { paddingBottom: toastBottomOffset }]}>
          <ModalBackdropBlur />
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              if (canDismiss) {
                closeCurrent();
              }
            }}
          />
          <View style={styles.card}>
            <View
              style={[
                styles.toneBar,
                tone === "success" && styles.toneSuccess,
                tone === "warning" && styles.toneWarning,
                tone === "danger" && styles.toneDanger,
                tone === "info" && styles.toneInfo,
              ]}
            />
            <Text style={styles.title}>{current?.title || "Notice"}</Text>
            {current?.message ? <Text style={styles.message}>{current.message}</Text> : null}

            <View style={styles.actions}>
              {current?.buttons.map((button, index) => {
                const kind = button.style ?? "default";
                return (
                  <Pressable
                    key={`${current.id}-${index}`}
                    style={[
                      styles.actionButton,
                      kind === "cancel" && styles.actionButtonCancel,
                      kind === "destructive" && styles.actionButtonDanger,
                    ]}
                    onPress={() => pressButton(button)}
                  >
                    <Text
                      style={[
                        styles.actionText,
                        kind === "cancel" && styles.actionTextCancel,
                        kind === "destructive" && styles.actionTextDanger,
                      ]}
                    >
                      {button.text ?? "OK"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  toastOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
    justifyContent: "flex-end",
    paddingHorizontal: 16,
    alignItems: "center",
  },
  toastCard: {
    width: "100%",
    maxWidth: 460,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    borderColor: appTheme.colors.borderStrong,
    backgroundColor: appTheme.colors.surface,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowColor: appTheme.colors.previewBackdrop,
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  toastToneDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    flexShrink: 0,
  },
  toastTextWrap: {
    flex: 1,
    gap: 2,
  },
  bannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
    justifyContent: "flex-start",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  bannerCard: {
    width: "100%",
    maxWidth: 460,
    borderRadius: appTheme.radius.lg,
    borderWidth: 1,
    borderColor: appTheme.colors.borderStrong,
    backgroundColor: appTheme.colors.surface,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowColor: appTheme.colors.previewBackdrop,
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  bannerTitle: {
    color: appTheme.colors.text,
    fontSize: 15,
    lineHeight: 19,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  bannerMessage: {
    color: appTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 17,
    fontFamily: appTheme.fonts.body,
  },
  toastTitle: {
    color: appTheme.colors.text,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  toastMessage: {
    color: appTheme.colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: appTheme.fonts.body,
  },
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
    paddingHorizontal: 18,
    backgroundColor: appTheme.colors.overlayStrong,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    borderRadius: appTheme.radius.lg,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.surface,
    padding: appTheme.spacing.md,
    gap: appTheme.spacing.sm,
    shadowColor: appTheme.colors.previewSurface,
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 7,
  },
  toneBar: {
    width: "100%",
    height: 6,
    borderRadius: appTheme.radius.pill,
  },
  toneSuccess: { backgroundColor: appTheme.colors.success },
  toneWarning: { backgroundColor: appTheme.colors.warning },
  toneDanger: { backgroundColor: appTheme.colors.danger },
  toneInfo: { backgroundColor: appTheme.colors.info },
  title: {
    color: appTheme.colors.text,
    fontSize: 20,
    lineHeight: 24,
    fontFamily: appTheme.fonts.heading,
  },
  message: {
    color: appTheme.colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: appTheme.fonts.body,
  },
  actions: {
    marginTop: 2,
    gap: appTheme.spacing.xs,
  },
  actionButton: {
    borderRadius: appTheme.radius.sm,
    borderWidth: 1,
    borderColor: appTheme.colors.primaryPressed,
    backgroundColor: appTheme.colors.primary,
    paddingVertical: 11,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  actionButtonCancel: {
    borderColor: appTheme.colors.borderStrong,
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  actionButtonDanger: {
    borderColor: appTheme.colors.dangerPressed,
    backgroundColor: appTheme.colors.danger,
  },
  actionText: {
    color: appTheme.colors.onPrimary,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  actionTextCancel: {
    color: appTheme.colors.text,
  },
  actionTextDanger: {
    color: appTheme.colors.onPrimary,
  },
});
