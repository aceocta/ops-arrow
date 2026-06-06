import React, { useEffect, useMemo, useState } from "react";
import { Alert, StyleSheet, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ScreenContainer } from "../../components/ScreenContainer";
import { SkeletonList } from "../../components/Skeleton";
import { useAuth } from "../../auth/AuthContext";
import { getShopFeatureToggles, updateShopFeatureToggles, type ShopFeatureModule } from "../../api/shopsApi";
import { clearCachedEntitlements } from "../subscription/entitlements";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

export function ShopFeatureTogglesScreen() {
  const { activeShop, activeShopId } = useAuth();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Set<string>>(new Set());

  const togglesQuery = useQuery({
    queryKey: ["shop-feature-toggles", activeShopId],
    queryFn: () => getShopFeatureToggles(activeShopId!),
    enabled: Boolean(activeShopId),
  });

  // Server is the source of truth; seed local draft once when query lands or shop changes.
  useEffect(() => {
    if (!togglesQuery.data) return;
    const disabled = togglesQuery.data.modules
      .filter((m) => m.isDisabledByShop)
      .map((m) => m.key);
    setDraft(new Set(disabled));
  }, [togglesQuery.data]);

  const modules = togglesQuery.data?.modules ?? [];

  const updateMutation = useMutation({
    mutationFn: (disabled: string[]) => updateShopFeatureToggles(activeShopId!, disabled),
    onSuccess: async (data) => {
      queryClient.setQueryData(["shop-feature-toggles", activeShopId], data);
      // Entitlements depend on this — invalidate so navigation/UI re-gates.
      await queryClient.invalidateQueries({ queryKey: ["shop-entitlements", activeShopId] });
      await queryClient.invalidateQueries({ queryKey: ["shop-subscription-summary", activeShopId] });
      await clearCachedEntitlements(activeShopId);
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : "Unable to update feature toggles.";
      Alert.alert("Update failed", message);
    },
  });

  function setModuleEnabled(moduleKey: string, enabled: boolean) {
    const next = new Set(draft);
    if (enabled) next.delete(moduleKey);
    else next.add(moduleKey);
    setDraft(next);
    updateMutation.mutate(Array.from(next));
  }

  const enabledCount = useMemo(
    () => modules.filter((m) => m.isAvailableInPlan && !draft.has(m.key)).length,
    [modules, draft]
  );

  if (!activeShopId) {
    return (
      <ScreenContainer>
        <View style={ui.card}>
          <Text style={styles.meta}>Select a shop first.</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <View style={ui.card}>
        <Text style={styles.meta}>Shop: {activeShop?.shopName ?? "-"}</Text>
        <View style={styles.helperRow}>
          <Ionicons name="information-circle-outline" size={14} color={appTheme.colors.textMuted} />
          <Text style={styles.helperText}>
            Turn off any module your shop does not use. Disabling one module does not affect the others.
            Re-enable any time. Modules locked by your plan can't be turned on here — upgrade first.
          </Text>
        </View>

        {togglesQuery.isLoading ? (
          <SkeletonList count={5} rowHeight={56} />
        ) : togglesQuery.isError ? (
          <Text style={styles.error}>Unable to load feature toggles. Pull to refresh or try again.</Text>
        ) : modules.length === 0 ? (
          <Text style={styles.meta}>No togglable modules.</Text>
        ) : (
          modules.map((module, idx) => (
            <React.Fragment key={module.key}>
              {idx > 0 ? <View style={styles.divider} /> : null}
              <ModuleRow
                module={module}
                isEnabledLocally={module.isAvailableInPlan && !draft.has(module.key)}
                isSaving={updateMutation.isPending}
                onChange={(value) => setModuleEnabled(module.key, value)}
              />
            </React.Fragment>
          ))
        )}

        {!togglesQuery.isLoading && modules.length > 0 ? (
          <Text style={styles.footnote}>{enabledCount} of {modules.length} modules enabled</Text>
        ) : null}
      </View>
    </ScreenContainer>
  );
}

function ModuleRow({
  module,
  isEnabledLocally,
  isSaving,
  onChange,
}: {
  module: ShopFeatureModule;
  isEnabledLocally: boolean;
  isSaving: boolean;
  onChange: (value: boolean) => void;
}) {
  const lockedByPlan = !module.isAvailableInPlan;
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <View style={styles.rowTitleRow}>
          <Text style={styles.rowTitle}>{module.name}</Text>
          {lockedByPlan ? (
            <View style={styles.lockedBadge}>
              <Ionicons name="lock-closed" size={10} color={appTheme.colors.textBrandStrong} />
              <Text style={styles.lockedBadgeText}>Not in plan</Text>
            </View>
          ) : null}
        </View>
        {module.description ? <Text style={styles.rowHelp}>{module.description}</Text> : null}
      </View>
      <Switch
        value={isEnabledLocally}
        onValueChange={onChange}
        disabled={lockedByPlan || isSaving}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    ...appTheme.typography.title,
    color: appTheme.colors.text,
  },
  meta: {
    ...appTheme.typography.body,
    color: appTheme.colors.textMuted,
  },
  helperRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginTop: 6,
    marginBottom: 8,
  },
  helperText: {
    color: appTheme.colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
    flex: 1,
  },
  error: {
    ...appTheme.typography.body,
    color: appTheme.colors.danger,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.sm,
    paddingVertical: 8,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rowTitle: {
    ...appTheme.typography.bodyEmphasis,
    color: appTheme.colors.text,
  },
  rowHelp: {
    ...appTheme.typography.caption,
    color: appTheme.colors.textMuted,
  },
  lockedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: appTheme.colors.surfaceBrandSoft,
    borderRadius: appTheme.radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  lockedBadgeText: {
    color: appTheme.colors.textBrandStrong,
    fontSize: 10,
    lineHeight: 12,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  divider: {
    height: 1,
    backgroundColor: appTheme.colors.border,
    marginVertical: 2,
  },
  footnote: {
    marginTop: 10,
    color: appTheme.colors.textMuted,
    fontSize: 12,
  },
});
