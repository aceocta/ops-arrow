import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ScreenContainer } from "../../components/ScreenContainer";
import { useAuth } from "../../auth/AuthContext";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";
import { useFeature } from "../subscription/useFeature";
import { UpgradeNotice } from "../subscription/FeatureGate";

/**
 * Notification channel preferences per active shop. Preferences are persisted locally per
 * shop while the server-side preferences endpoint is being built; the toggles still respect
 * what's allowed by the shop's subscription plan.
 */

const PREF_STORAGE_PREFIX = "notif-prefs:v1:";

type PrefsShape = {
  emailEnabled: boolean;
  pushEnabled: boolean;
  whatsAppEnabled: boolean;
  priorityEnabled: boolean;
};

const defaultPrefs: PrefsShape = {
  emailEnabled: true,
  pushEnabled: true,
  whatsAppEnabled: true,
  priorityEnabled: false,
};

export function NotificationPreferencesScreen() {
  const { activeShop, activeShopId } = useAuth();
  const emailFeature = useFeature("notifications.email");
  const pushFeature = useFeature("notifications.push");
  const whatsAppFeature = useFeature("notifications.whatsapp");
  const priorityFeature = useFeature("notifications.priority");

  const [prefs, setPrefs] = useState<PrefsShape>(defaultPrefs);
  const storageKey = activeShopId ? `${PREF_STORAGE_PREFIX}${activeShopId}` : null;

  useEffect(() => {
    if (!storageKey) return;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(storageKey);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<PrefsShape>;
          setPrefs({ ...defaultPrefs, ...parsed });
        } else {
          setPrefs(defaultPrefs);
        }
      } catch {
        setPrefs(defaultPrefs);
      }
    })();
  }, [storageKey]);

  const updatePref = useCallback(
    (patch: Partial<PrefsShape>) => {
      setPrefs((prev) => {
        const next = { ...prev, ...patch };
        if (storageKey) {
          void AsyncStorage.setItem(storageKey, JSON.stringify(next)).catch(() => undefined);
        }
        return next;
      });
    },
    [storageKey],
  );

  return (
    <ScreenContainer>
      <View style={ui.card}>
        <Text style={styles.title}>Notification Channels</Text>
        <Text style={styles.meta}>Shop: {activeShop?.shopName ?? "-"}</Text>
        <View style={styles.localNotice}>
          <Ionicons name="information-circle-outline" size={14} color={appTheme.colors.textMuted} />
          <Text style={styles.localNoticeText}>
            Preferences are saved to this device. Server-side sync is coming soon.
          </Text>
        </View>

        <ChannelRow
          title="Email"
          help="Daily summaries, alerts and reports by email."
          featureKey="notifications.email"
          isAllowed={emailFeature.isAllowed}
          isLoading={emailFeature.isLoading}
          isEnabled={emailFeature.isAllowed && prefs.emailEnabled}
          upgradeLabel="Starter"
          onChange={(value) => updatePref({ emailEnabled: value })}
        />

        <View style={styles.divider} />

        <ChannelRow
          title="Push notifications"
          help="Real-time alerts on this device."
          featureKey="notifications.push"
          isAllowed={pushFeature.isAllowed}
          isLoading={pushFeature.isLoading}
          isEnabled={pushFeature.isAllowed && prefs.pushEnabled}
          upgradeLabel="Growth"
          onChange={(value) => updatePref({ pushEnabled: value })}
        />

        <View style={styles.divider} />

        <ChannelRow
          title="WhatsApp"
          help="Critical alerts via WhatsApp Business."
          featureKey="notifications.whatsapp"
          isAllowed={whatsAppFeature.isAllowed}
          isLoading={whatsAppFeature.isLoading}
          isEnabled={whatsAppFeature.isAllowed && prefs.whatsAppEnabled}
          upgradeLabel="Growth"
          onChange={(value) => updatePref({ whatsAppEnabled: value })}
        />

        <View style={styles.divider} />

        <ChannelRow
          title="Priority alerts"
          help="Loud, immediate notifications for high-severity issues."
          featureKey="notifications.priority"
          isAllowed={priorityFeature.isAllowed}
          isLoading={priorityFeature.isLoading}
          isEnabled={priorityFeature.isAllowed && prefs.priorityEnabled}
          upgradeLabel="Pro"
          onChange={(value) => updatePref({ priorityEnabled: value })}
        />
      </View>
    </ScreenContainer>
  );
}

function ChannelRow({
  title,
  help,
  featureKey,
  isAllowed,
  isLoading,
  isEnabled,
  upgradeLabel,
  onChange,
}: {
  title: string;
  help: string;
  featureKey: string;
  isAllowed: boolean;
  isLoading: boolean;
  isEnabled: boolean;
  upgradeLabel: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <>
      <View style={styles.row}>
        <View style={styles.rowText}>
          <View style={styles.rowTitleRow}>
            <Text style={styles.rowTitle}>{title}</Text>
            {!isLoading && !isAllowed ? (
              <View style={styles.upgradeBadge}>
                <Ionicons name="lock-closed" size={10} color={appTheme.colors.textBrandStrong} />
                <Text style={styles.upgradeBadgeText}>{upgradeLabel}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.rowHelp}>{help}</Text>
        </View>
        <Switch value={isEnabled} onValueChange={onChange} disabled={!isAllowed} />
      </View>
      {!isLoading && !isAllowed ? (
        <UpgradeNotice feature={featureKey} compact title={`${title} isn't included in your plan`} />
      ) : null}
    </>
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
  localNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
    marginBottom: 8,
  },
  localNoticeText: {
    color: appTheme.colors.textMuted,
    fontSize: 12,
    lineHeight: 15,
    flex: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.sm,
    paddingVertical: 6,
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
  upgradeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: appTheme.colors.surfaceBrandSoft,
    borderRadius: appTheme.radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  upgradeBadgeText: {
    color: appTheme.colors.textBrandStrong,
    fontSize: 10,
    lineHeight: 12,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  divider: {
    height: 1,
    backgroundColor: appTheme.colors.border,
    marginVertical: 4,
  },
});
