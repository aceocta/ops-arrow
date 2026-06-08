import { showAppAlert } from "../components/AppAlert";

type DestructiveConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

/**
 * Standard destructive-action confirm. Returns a promise that resolves to true when the user
 * taps the confirm button, false on cancel / dismiss. Use this anywhere we'd otherwise build
 * an ad-hoc `Alert.alert(..., [Cancel, Delete])` so the wording and UX stay consistent.
 *
 *   if (await confirmDestructive({ title: "Delete till", message: "..." })) {
 *     await deleteTill(id);
 *   }
 */
export function confirmDestructive(options: DestructiveConfirmOptions): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const settle = (value: boolean) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    // Routes through the app's modern in-app dialog host (not the native OS alert).
    showAppAlert(
      options.title,
      options.message,
      [
        { text: options.cancelLabel ?? "Cancel", style: "cancel", onPress: () => settle(false) },
        { text: options.confirmLabel ?? "Delete", style: "destructive", onPress: () => settle(true) },
      ],
      { cancelable: true, onDismiss: () => settle(false) },
    );
  });
}
