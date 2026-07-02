import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { EmptyState } from "./EmptyState";
import { LoadingState } from "./LoadingState";

type QueryStateGateProps = {
  /** True while the first load is in flight. */
  isLoading: boolean;
  /** True when the query failed. Rendered ahead of the empty state so failures never look "empty". */
  isError?: boolean;
  /** True when the query succeeded but returned no rows. */
  isEmpty?: boolean;
  onRetry?: () => void;

  loadingMessage?: string;

  errorTitle?: string;
  errorMessage?: string;
  errorIcon?: keyof typeof Ionicons.glyphMap;

  emptyIcon?: keyof typeof Ionicons.glyphMap;
  emptyTitle?: string;
  emptyMessage?: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;

  children: React.ReactNode;
};

/**
 * Standard gate for react-query-backed screens. Guarantees the four states are handled in the right
 * order — loading, then error (with retry), then empty, then content — so a failed request can never
 * render as a misleading "Nothing here yet" empty state (a recurring trust bug on list/report screens).
 */
export function QueryStateGate({
  isLoading,
  isError = false,
  isEmpty = false,
  onRetry,
  loadingMessage,
  errorTitle = "Something went wrong",
  errorMessage = "We couldn't load this. Check your connection and try again.",
  errorIcon = "cloud-offline-outline",
  emptyIcon,
  emptyTitle = "Nothing here yet",
  emptyMessage,
  emptyActionLabel,
  onEmptyAction,
  children,
}: QueryStateGateProps) {
  if (isLoading) {
    return <LoadingState message={loadingMessage} />;
  }

  if (isError) {
    return (
      <EmptyState
        icon={errorIcon}
        title={errorTitle}
        message={errorMessage}
        actionLabel={onRetry ? "Try again" : undefined}
        onAction={onRetry}
      />
    );
  }

  if (isEmpty) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyTitle}
        message={emptyMessage}
        actionLabel={emptyActionLabel}
        onAction={onEmptyAction}
      />
    );
  }

  return <>{children}</>;
}
