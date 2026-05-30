import { Alert } from "react-native";

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
    Alert.alert(
      options.title,
      options.message,
      [
        { text: options.cancelLabel ?? "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: options.confirmLabel ?? "Delete", style: "destructive", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
