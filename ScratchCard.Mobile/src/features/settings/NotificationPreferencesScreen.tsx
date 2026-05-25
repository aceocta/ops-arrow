import React, { useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { ScreenContainer } from "../../components/ScreenContainer";
import { useAuth } from "../../auth/AuthContext";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";
import { useFeature } from "../subscription/useFeature";
import { UpgradeNotice } from "../subscription/FeatureGate";

/**
 * Notification channel preferences per active shop. The toggles reflect what's allowed by the
 * shop's subscription plan; disabled channels show an inline upgrade nudge.
 *
 * NOTE: There is no backend endpoint to persist these preferences yet. Local state is kept in
 * component memory so users can see how the gating works. Wire to a real preferences endpoint
 * (e.g. /api/notifications/preferences) when you build it.
 */
export function NotificationPreferencesScreen() {
  const { activeShop } = useAuth();
  const emailFeature = useFeature("notifications.email");
  const pushFeature = useFeature("notifications.push");
  const whatsAppFeature = useFeature("notifications.whatsapp");
  const priorityFeature = useFeature("notifications.priority");

  // Local-only preferences for now. Defaults to "enabled where allowed".
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [whatsAppEnabled, setWhatsAppEnabled] = useState(true);
  const [priorityEnabled, setPriorityEnabled] = useState(false);

  return (
    <ScreenContainer>
      <View style={ui.card}>
        <Text style={styles.title}>Notification Channels</Text>
        <Text style={styles.meta}>Shop: {activeShop?.shopName ?? "-"}</Text>

        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>Email</Text>
            <Text style={styles.rowHelp}>Daily summaries, alerts and reports by email.</Text>
          </View>
          <Switch
            value={emailFeature.isAllowed && emailEnabled}
            onValueChange={setEmailEnabled}
            disabled={!emailFeature.isAllowed}
          />
        </View>

        <View style={styles.divider} />

        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>Push notifications</Text>
            <Text style={styles.rowHelp}>Real-time alerts on this device.</Text>
          </View>
          <Switch
            value={pushFeature.isAllowed && pushEnabled}
            onValueChange={setPushEnabled}
            disabled={!pushFeature.isAllowed}
          />
        </View>
        {!pushFeature.isLoading && !pushFeature.isAllowed ? (
          <UpgradeNotice feature="notifications.push" compact title="Push is a Growth feature" />
        ) : null}

        <View style={styles.divider} />

        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>WhatsApp</Text>
            <Text style={styles.rowHelp}>Critical alerts via WhatsApp Business.</Text>
          </View>
          <Switch
            value={whatsAppFeature.isAllowed && whatsAppEnabled}
            onValueChange={setWhatsAppEnabled}
            disabled={!whatsAppFeature.isAllowed}
          />
        </View>
        {!whatsAppFeature.isLoading && !whatsAppFeature.isAllowed ? (
          <UpgradeNotice feature="notifications.whatsapp" compact title="WhatsApp is a Growth feature" />
        ) : null}

        <View style={styles.divider} />

        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>Priority alerts</Text>
            <Text style={styles.rowHelp}>Loud, immediate notifications for high-severity issues.</Text>
          </View>
          <Switch
            value={priorityFeature.isAllowed && priorityEnabled}
            onValueChange={setPriorityEnabled}
            disabled={!priorityFeature.isAllowed}
          />
        </View>
        {!priorityFeature.isLoading && !priorityFeature.isAllowed ? (
          <UpgradeNotice feature="notifications.priority" compact title="Priority alerts are a Pro feature" />
        ) : null}
      </View>
    </ScreenContainer>
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
  rowTitle: {
    ...appTheme.typography.bodyEmphasis,
    color: appTheme.colors.text,
  },
  rowHelp: {
    ...appTheme.typography.caption,
    color: appTheme.colors.textMuted,
  },
  divider: {
    height: 1,
    backgroundColor: appTheme.colors.border,
    marginVertical: 4,
  },
});
