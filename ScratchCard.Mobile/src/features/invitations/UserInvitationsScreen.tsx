import React, { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import { listInvitations, sendInvitation, cancelInvitation } from "../../api/invitationsApi";
import { getRoleOptions } from "../../api/lookupsApi";
import { ScreenContainer } from "../../components/ScreenContainer";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

type InvitationItem = {
  id: string;
  email: string;
  roleName: string;
  status: string;
  expiresOn: string;
  acceptedOn?: string;
  cancelledOn?: string;
};

export function UserInvitationsScreen() {
  const queryClient = useQueryClient();
  const { activeShopId, activeShop, profile } = useAuth();
  const shopId = activeShopId;
  const canSendInvitations =
    profile?.roles?.some((role) => role === "PlatformAdmin" || role === "ShopOwner" || role === "Manager") ?? false;
  const canCancelInvitations =
    profile?.roles?.some((role) => role === "ShopOwner") ?? false;
  const [email, setEmail] = useState("");
  const [expiryHours, setExpiryHours] = useState("72");
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");

  const rolesQuery = useQuery({
    queryKey: ["roles"],
    queryFn: getRoleOptions,
    enabled: Boolean(shopId) && canSendInvitations,
  });

  const invitationsQuery = useQuery({
    queryKey: ["invitations", shopId],
    queryFn: () => listInvitations(shopId as string),
    enabled: Boolean(shopId) && canSendInvitations,
  });

  const inviteRoleOptions = useMemo(() => {
    return (rolesQuery.data ?? []).filter((role) => role.name.replace(/\s+/g, "").toLowerCase() !== "platformadmin");
  }, [rolesQuery.data]);

  const selectedRoleName = useMemo(() => {
    return inviteRoleOptions.find((x) => x.id === selectedRoleId)?.name ?? "";
  }, [inviteRoleOptions, selectedRoleId]);

  const sendInvitationMutation = useMutation({
    mutationFn: async () => {
      if (!shopId) {
        throw new Error("No shop selected.");
      }
      if (!canSendInvitations) {
        throw new Error("Only PlatformAdmin, ShopOwner, or Manager can send invitations.");
      }

      if (!email.trim()) {
        throw new Error("Email is required.");
      }

      if (!selectedRoleId) {
        throw new Error("Role selection is required.");
      }

      const parsedExpiry = Number(expiryHours);
      if (!Number.isFinite(parsedExpiry) || parsedExpiry <= 0) {
        throw new Error("Expiry hours must be a positive number.");
      }

      return sendInvitation({
        shopId,
        email: email.trim().toLowerCase(),
        roleId: selectedRoleId,
        expiryHours: parsedExpiry,
      });
    },
    onSuccess: () => {
      setEmail("");
      setExpiryHours("72");
      Alert.alert("Invitation sent", "Invitation was created successfully.");
      void queryClient.invalidateQueries({ queryKey: ["invitations", shopId] });
    },
    onError: (error: any) => {
      Alert.alert("Failed", error?.response?.data?.message ?? error?.message ?? "Unable to send invitation.");
    },
  });

  const cancelInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) => cancelInvitation(invitationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["invitations", shopId] });
    },
    onError: (error: any) => {
      Alert.alert("Failed", error?.response?.data?.message ?? "Unable to cancel invitation.");
    },
  });

  const invitations = canSendInvitations ? (invitationsQuery.data ?? []) as InvitationItem[] : [];

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[ui.card, styles.card]}>
          <Text style={styles.caption}>Shop: {activeShop?.shopName ?? "-"}</Text>
          <Text style={styles.subtitle}>Invite managers or cashiers to this shop.</Text>
          {!canSendInvitations ? (
            <Text style={styles.caption}>Only PlatformAdmin, ShopOwner, or Manager can send invitations.</Text>
          ) : null}

          <Text style={styles.fieldLabel}>Invitee Email</Text>
          <TextInput
            style={[ui.input, styles.input]}
            value={email}
            placeholder="Invitee email"
            placeholderTextColor={appTheme.colors.textSubtle}
            autoCapitalize="none"
            keyboardType="email-address"
            onChangeText={setEmail}
            editable={canSendInvitations}
          />

          <Text style={styles.fieldLabel}>Expiry Hours</Text>
          <TextInput
            style={[ui.input, styles.input]}
            value={expiryHours}
            placeholder="Expiry hours (e.g. 72)"
            placeholderTextColor={appTheme.colors.textSubtle}
            keyboardType="number-pad"
            onChangeText={setExpiryHours}
            editable={canSendInvitations}
          />

          <Text style={styles.fieldLabel}>Role</Text>
          <View style={styles.roleWrap}>
            {inviteRoleOptions.map((role) => {
              const selected = selectedRoleId === role.id;
              return (
                <Pressable
                  key={role.id}
                  style={[styles.roleChip, selected && styles.roleChipSelected]}
                  onPress={() => canSendInvitations && setSelectedRoleId(role.id)}
                >
                  <Text style={[styles.roleChipText, selected && styles.roleChipTextSelected]}>{role.name}</Text>
                </Pressable>
              );
            })}
          </View>

          {selectedRoleName ? <Text style={styles.caption}>Selected role: {selectedRoleName}</Text> : null}

          <PrimaryButton
            label={sendInvitationMutation.isPending ? "Sending..." : "Send Invitation"}
            onPress={() => sendInvitationMutation.mutate()}
            disabled={sendInvitationMutation.isPending || !shopId || !canSendInvitations}
          />
        </View>

        <View style={[ui.card, styles.card]}>
          <Text style={styles.sectionTitle}>Existing Invitations</Text>
          {!canSendInvitations ? <Text style={styles.empty}>You do not have access to invitation management.</Text> : null}
          {invitations.length === 0 ? <Text style={styles.empty}>No invitations yet.</Text> : null}
          {invitations.map((item) => (
            <View key={item.id} style={[ui.listItem, styles.listItem]}>
              <Text style={styles.email}>{item.email}</Text>
              <Text style={styles.meta}>
                Role: {item.roleName} | Status: {item.status}
              </Text>
              <Text style={styles.meta}>Expires: {new Date(item.expiresOn).toLocaleString()}</Text>
              {item.status === "Pending" && canCancelInvitations ? (
                <Pressable
                  style={styles.cancelButton}
                  onPress={() => cancelInvitationMutation.mutate(item.id)}
                  disabled={cancelInvitationMutation.isPending}
                >
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: appTheme.spacing.sm,
    paddingBottom: appTheme.spacing.sm,
  },
  card: {
    gap: appTheme.spacing.sm,
  },
  subtitle: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 13,
    lineHeight: 18,
  },
  fieldLabel: {
    color: appTheme.colors.text,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  input: {
    borderRadius: appTheme.radius.sm,
    paddingVertical: 10,
  },
  roleWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: appTheme.spacing.xs,
  },
  roleChip: {
    borderWidth: 1,
    borderColor: appTheme.colors.primary,
    borderRadius: appTheme.radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: appTheme.colors.surface,
  },
  roleChipSelected: {
    backgroundColor: appTheme.colors.primary,
  },
  roleChipText: {
    color: appTheme.colors.primary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 14,
  },
  roleChipTextSelected: {
    color: appTheme.colors.onPrimary,
  },
  caption: {
    color: appTheme.colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: appTheme.fonts.body,
  },
  sectionTitle: {
    fontSize: 17,
    lineHeight: 22,
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  empty: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 13,
    lineHeight: 18,
  },
  listItem: {
    backgroundColor: appTheme.colors.surfaceTintSoft,
    borderColor: appTheme.colors.border,
    gap: 4,
  },
  email: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  meta: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    lineHeight: 16,
  },
  cancelButton: {
    alignSelf: "flex-start",
    backgroundColor: appTheme.colors.danger,
    borderRadius: appTheme.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 4,
  },
  cancelText: {
    color: appTheme.colors.onPrimary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 14,
  },
});
