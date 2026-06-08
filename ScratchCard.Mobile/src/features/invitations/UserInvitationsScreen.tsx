import React, { useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { RouteProp, useRoute } from "@react-navigation/native";
import { MainStackParamList } from "../../types/navigation";
import { FloatingLabelInput } from "../../components/FloatingLabelInput";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import { listInvitations, sendInvitation, cancelInvitation } from "../../api/invitationsApi";
import { getRoleOptions } from "../../api/lookupsApi";
import { listUsers } from "../../api/usersApi";
import { ScreenContainer } from "../../components/ScreenContainer";
import { toastError } from "../../components/toast";
import { PrimaryButton } from "../../components/PrimaryButton";
import { useEntitlements } from "../subscription/useEntitlements";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";
import { getRoleDisplayName } from "../../utils/roleLabels";

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
    profile?.roles?.some((role) => role === "PlatformAdmin" || role === "CompanyOwner" || role === "Manager") ?? false;
  const canCancelInvitations =
    profile?.roles?.some((role) => role === "CompanyOwner") ?? false;
  const route = useRoute<RouteProp<MainStackParamList, "UserInvitations">>();
  const [email, setEmail] = useState(route.params?.email ?? "");
  const [expiryHours, setExpiryHours] = useState("72");
  const expiryHoursRef = useRef<TextInput>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<string>(route.params?.roleId ?? "");

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

  // Pull active shop users to compute current seat usage against the plan's MaxUsers.
  const usersQuery = useQuery({
    queryKey: ["shop-users", shopId],
    queryFn: () => listUsers(shopId as string),
    enabled: Boolean(shopId) && canSendInvitations,
  });

  const { entitlements } = useEntitlements();
  const maxUsers = entitlements?.maxUsers ?? null;
  const assignedUsers = usersQuery.data?.length ?? 0;
  const pendingInvites = (invitationsQuery.data ?? []).filter(
    (i: InvitationItem) => i.status?.toLowerCase() === "pending"
  ).length;
  const usedSeats = assignedUsers + pendingInvites;
  const seatsExhausted = maxUsers !== null && usedSeats >= maxUsers;
  const seatStatus = maxUsers === null
    ? "Unlimited seats"
    : `${usedSeats} of ${maxUsers} seats used`;

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
        throw new Error("Only Platform Admin, Company Owner, or Manager can send invitations.");
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
      toastError(error?.response?.data?.message ?? error?.message ?? "Unable to send invitation.");
    },
  });

  const cancelInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) => cancelInvitation(invitationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["invitations", shopId] });
    },
    onError: (error: any) => {
      toastError(error?.response?.data?.message ?? "Unable to cancel invitation.");
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
            <Text style={styles.caption}>Only Platform Admin, Company Owner, or Manager can send invitations.</Text>
          ) : null}
          {canSendInvitations ? (
            <View style={[styles.seatBadge, seatsExhausted && styles.seatBadgeExhausted]}>
              <Text style={[styles.seatBadgeText, seatsExhausted && styles.seatBadgeTextExhausted]}>
                {seatStatus}
                {seatsExhausted ? " — upgrade to add more" : ""}
              </Text>
            </View>
          ) : null}

          <FloatingLabelInput
            label="Invitee email"
            value={email}
            autoCapitalize="none"
            keyboardType="email-address"
            onChangeText={setEmail}
            editable={canSendInvitations}
            autoCorrect={false}
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => expiryHoursRef.current?.focus()}
          />

          <FloatingLabelInput
            ref={expiryHoursRef}
            label="Expiry hours (e.g. 72)"
            value={expiryHours}
            keyboardType="number-pad"
            onChangeText={setExpiryHours}
            editable={canSendInvitations}
            returnKeyType="done"
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
                  <Text style={[styles.roleChipText, selected && styles.roleChipTextSelected]}>{getRoleDisplayName(role.name)}</Text>
                </Pressable>
              );
            })}
          </View>

          {selectedRoleName ? <Text style={styles.caption}>Selected role: {getRoleDisplayName(selectedRoleName)}</Text> : null}

          <PrimaryButton
            label={
              sendInvitationMutation.isPending
                ? "Sending..."
                : seatsExhausted
                  ? "Seat limit reached"
                  : "Send Invitation"
            }
            onPress={() => sendInvitationMutation.mutate()}
            disabled={sendInvitationMutation.isPending || !shopId || !canSendInvitations || seatsExhausted}
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
                Role: {getRoleDisplayName(item.roleName)} | Status: {item.status}
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
  seatBadge: {
    alignSelf: "flex-start",
    backgroundColor: appTheme.colors.surfaceInfoMuted,
    borderRadius: appTheme.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  seatBadgeExhausted: {
    backgroundColor: appTheme.colors.surfaceWarningSoft,
  },
  seatBadgeText: {
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
    color: appTheme.colors.textInfoStrong,
  },
  seatBadgeTextExhausted: {
    color: appTheme.colors.textWarningStrong,
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

