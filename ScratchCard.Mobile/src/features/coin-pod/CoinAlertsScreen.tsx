import React, { useState } from "react";
import { RefreshControl, StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CoinBagAlert, CoinBagAlertStatus, dismissCoinAlert, getCoinAlerts } from "../../api/coinPodApi";
import { useAuth } from "../../auth/AuthContext";
import { PrimaryButton } from "../../components/PrimaryButton";
import { QueryStateGate } from "../../components/QueryStateGate";
import { ScreenContainer } from "../../components/ScreenContainer";
import { SegmentedControl } from "../../components/SegmentedControl";
import { StatusBadge } from "../../components/StatusBadge";
import { toastError, toastSuccess } from "../../components/toast";
import { getApiErrorMessage } from "../../utils/apiErrorMessage";
import { formatDateTimeLabel } from "../../utils/dateLabels";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

const MANAGE_ROLES = ["PlatformAdmin", "CompanyOwner", "Manager"];

type Filter = "all" | CoinBagAlertStatus;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "Active", label: "Active" },
  { value: "Resolved", label: "Resolved" },
  { value: "all", label: "All" },
];

function statusTone(status: CoinBagAlertStatus): "neutral" | "warning" | "danger" | "success" {
  if (status === "Active") return "danger";
  if (status === "Resolved") return "success";
  return "neutral";
}

// Renders the UTC timestamp in the device's local time (previously it sliced the raw ISO string,
// showing UTC — an hour out during BST on an alert screen).
function formatDateTime(iso: string) {
  return formatDateTimeLabel(iso);
}

export function CoinAlertsScreen() {
  const queryClient = useQueryClient();
  const { activeShopId, activeShop, profile } = useAuth();
  const canManage = MANAGE_ROLES.includes(activeShop?.role ?? "") || (profile?.roles?.some((r) => MANAGE_ROLES.includes(r)) ?? false);
  const [filter, setFilter] = useState<Filter>("Active");

  const query = useQuery({
    queryKey: ["coin-pod-alerts", activeShopId, filter],
    queryFn: () => getCoinAlerts(activeShopId as string, filter === "all" ? undefined : filter),
    enabled: Boolean(activeShopId),
  });

  const dismissMutation = useMutation({
    mutationFn: (alertId: string) => dismissCoinAlert(activeShopId as string, alertId),
    onSuccess: () => {
      toastSuccess("Alert dismissed.");
      void queryClient.invalidateQueries({ queryKey: ["coin-pod-alerts", activeShopId] });
      void queryClient.invalidateQueries({ queryKey: ["coin-pod-dashboard", activeShopId] });
    },
    onError: (error: unknown) => toastError(getApiErrorMessage(error, "Unable to dismiss the alert.")),
  });

  const alerts = query.data ?? [];

  return (
    <ScreenContainer
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={appTheme.colors.primary} />}
    >
      <View style={styles.filters}>
        <SegmentedControl options={FILTERS} value={filter} onChange={setFilter} />
      </View>

      <QueryStateGate
        isLoading={query.isLoading}
        isError={query.isError && alerts.length === 0}
        onRetry={() => void query.refetch()}
        loadingMessage="Loading alerts…"
        errorTitle="Couldn't load alerts"
        errorMessage="Check your connection and try again."
        isEmpty={alerts.length === 0}
        emptyIcon="checkmark-circle-outline"
        emptyTitle="No alerts"
        emptyMessage={filter === "Active" ? "No active coin stock alerts." : "No alerts match this filter."}
      >
        <View style={styles.list}>
          {alerts.map((a) => (
            <AlertCard key={a.id} alert={a} canManage={canManage} onDismiss={() => dismissMutation.mutate(a.id)} dismissing={dismissMutation.isPending} />
          ))}
        </View>
      </QueryStateGate>
    </ScreenContainer>
  );
}

function AlertCard({ alert, canManage, onDismiss, dismissing }: { alert: CoinBagAlert; canManage: boolean; onDismiss: () => void; dismissing: boolean }) {
  return (
    <View style={[ui.card, styles.card]}>
      <View style={styles.cardHeader}>
        <View style={styles.coinBadge}><Text style={styles.coinBadgeText}>{alert.displayLabel}</Text></View>
        <View style={styles.headerMain}>
          <Text style={styles.cardTitle}>{alert.alertType === "OutOfStock" ? "Out of stock" : "Low stock"}</Text>
          <Text style={styles.cardMeta}>Triggered {formatDateTime(alert.triggeredOn)}</Text>
        </View>
        <StatusBadge label={alert.status} tone={statusTone(alert.status)} />
      </View>
      <Text style={styles.message}>{alert.message}</Text>
      {alert.resolvedOn ? <Text style={styles.cardMeta}>Resolved {formatDateTime(alert.resolvedOn)}</Text> : null}
      {canManage && alert.status === "Active" ? (
        <PrimaryButton label={dismissing ? "Dismissing…" : "Dismiss"} tone="neutral" size="sm" onPress={onDismiss} disabled={dismissing} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  filters: { marginBottom: appTheme.spacing.sm },
  list: { gap: appTheme.spacing.sm },
  card: { gap: appTheme.spacing.xs },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: appTheme.spacing.sm },
  coinBadge: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: appTheme.colors.surfaceBrandSoft, borderWidth: 1, borderColor: appTheme.colors.primary },
  coinBadgeText: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.heading, fontSize: 12 },
  headerMain: { flex: 1 },
  cardTitle: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 15 },
  cardMeta: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 12 },
  message: { color: appTheme.colors.text, fontFamily: appTheme.fonts.body, fontSize: 13, lineHeight: 18 },
});
