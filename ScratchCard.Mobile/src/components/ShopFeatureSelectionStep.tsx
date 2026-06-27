import React, { useEffect, useMemo } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { getShopFeatureModulesForPlan, type ShopFeatureModule } from "../api/shopsApi";
import { Skeleton } from "./Skeleton";
import { appTheme } from "../ui/theme";

/**
 * Feature-selection step for shop creation. Lets the owner choose which modules the new shop will
 * use and reports the inverse (the disabled module keys) up to the parent so it can be posted with
 * the create request. Modules the chosen plan doesn't include are locked; the initial on/off state
 * matches what a brand-new shop would get by default.
 */
export function ShopFeatureSelectionStep({
  planId,
  disabledKeys,
  onChange,
  disabled,
}: {
  planId: string | null;
  disabledKeys: string[];
  onChange: (disabledKeys: string[]) => void;
  disabled?: boolean;
}) {
  const modulesQuery = useQuery({
    queryKey: ["shop-feature-modules", planId],
    queryFn: () => getShopFeatureModulesForPlan(planId ?? undefined),
    enabled: Boolean(planId),
    staleTime: 10 * 60 * 1000,
  });

  const modules = modulesQuery.data?.modules ?? [];

  // Seed the parent's draft from the server's default OFF state whenever the plan's module set
  // loads or changes. The parent owns the value so it can post it with the create request.
  useEffect(() => {
    if (!modulesQuery.data) return;
    const seeded = modulesQuery.data.modules.filter((m) => m.isDisabledByShop).map((m) => m.key);
    onChange(seeded);
    // Re-seed only when the module set (i.e. the plan) changes — not on every user toggle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modulesQuery.data]);

  const draft = useMemo(() => new Set(disabledKeys), [disabledKeys]);

  function setModuleEnabled(key: string, enabled: boolean) {
    const next = new Set(draft);
    if (enabled) next.delete(key);
    else next.add(key);
    onChange(Array.from(next));
  }

  const enabledCount = modules.filter((m) => m.isAvailableInPlan && !draft.has(m.key)).length;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Features</Text>
      <Text style={styles.subtitle}>
        Turn on the modules this shop will use. You can change these any time in Settings → Feature toggles.
      </Text>

      {!planId ? (
        <Text style={styles.hint}>Choose a subscription plan above to pick features.</Text>
      ) : modulesQuery.isLoading ? (
        <View style={{ gap: 8 }}>
          <Skeleton height={52} radius={appTheme.radius.sm} />
          <Skeleton height={52} radius={appTheme.radius.sm} />
          <Skeleton height={52} radius={appTheme.radius.sm} />
        </View>
      ) : modulesQuery.isError ? (
        <Text style={styles.error}>Unable to load features. You can set these up later in Settings.</Text>
      ) : (
        modules.map((module, idx) => (
          <React.Fragment key={module.key}>
            {idx > 0 ? <View style={styles.divider} /> : null}
            <FeatureRow
              module={module}
              isEnabled={module.isAvailableInPlan && !draft.has(module.key)}
              disabled={Boolean(disabled)}
              onChange={(value) => setModuleEnabled(module.key, value)}
            />
          </React.Fragment>
        ))
      )}

      {planId && !modulesQuery.isLoading && !modulesQuery.isError && modules.length > 0 ? (
        <Text style={styles.footnote}>{enabledCount} of {modules.length} modules on</Text>
      ) : null}
    </View>
  );
}

function FeatureRow({
  module,
  isEnabled,
  disabled,
  onChange,
}: {
  module: ShopFeatureModule;
  isEnabled: boolean;
  disabled: boolean;
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
      <Switch value={isEnabled} onValueChange={onChange} disabled={lockedByPlan || disabled} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: appTheme.spacing.xs,
    borderTopWidth: 1,
    borderTopColor: appTheme.colors.border,
    paddingTop: appTheme.spacing.sm,
    gap: 6,
  },
  title: {
    color: appTheme.colors.text,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  subtitle: {
    color: appTheme.colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: appTheme.fonts.body,
  },
  hint: {
    color: appTheme.colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: appTheme.fonts.body,
    marginTop: 4,
  },
  error: {
    color: appTheme.colors.danger,
    fontSize: 13,
    fontFamily: appTheme.fonts.body,
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
    color: appTheme.colors.text,
    fontSize: 14,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  rowHelp: {
    color: appTheme.colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: appTheme.fonts.body,
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
    marginTop: 8,
    color: appTheme.colors.textMuted,
    fontSize: 12,
    fontFamily: appTheme.fonts.body,
  },
});
