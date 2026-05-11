import React, { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import { listInvitations, sendInvitation, cancelInvitation } from "../../api/invitationsApi";
import { getRoleOptions } from "../../api/lookupsApi";
import { ScreenContainer } from "../../components/ScreenContainer";
import { PrimaryButton } from "../../components/PrimaryButton";

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
  const { activeShopId, activeShop } = useAuth();
  const shopId = activeShopId;
  const [email, setEmail] = useState("");
  const [expiryHours, setExpiryHours] = useState("72");
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");

  const rolesQuery = useQuery({
    queryKey: ["roles"],
    queryFn: getRoleOptions,
    enabled: Boolean(shopId),
  });

  const invitationsQuery = useQuery({
    queryKey: ["invitations", shopId],
    queryFn: () => listInvitations(shopId as string),
    enabled: Boolean(shopId),
  });

  const selectedRoleName = useMemo(() => {
    return rolesQuery.data?.find((x) => x.id === selectedRoleId)?.name ?? "";
  }, [rolesQuery.data, selectedRoleId]);

  const sendInvitationMutation = useMutation({
    mutationFn: async () => {
      if (!shopId) {
        throw new Error("No shop selected.");
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

  const invitations = (invitationsQuery.data ?? []) as InvitationItem[];

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ gap: 12 }}>
        <View style={styles.card}>
          <Text style={styles.caption}>Shop: {activeShop?.shopName ?? "-"}</Text>
          <Text style={styles.subtitle}>Invite managers or cashiers to this shop.</Text>

          <Text style={styles.fieldLabel}>Invitee Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            placeholder="Invitee email"
            autoCapitalize="none"
            keyboardType="email-address"
            onChangeText={setEmail}
          />

          <Text style={styles.fieldLabel}>Expiry Hours</Text>
          <TextInput
            style={styles.input}
            value={expiryHours}
            placeholder="Expiry hours (e.g. 72)"
            keyboardType="number-pad"
            onChangeText={setExpiryHours}
          />

          <Text style={styles.fieldLabel}>Role</Text>
          <View style={styles.roleWrap}>
            {(rolesQuery.data ?? []).map((role) => {
              const selected = selectedRoleId === role.id;
              return (
                <Pressable
                  key={role.id}
                  style={[styles.roleChip, selected && styles.roleChipSelected]}
                  onPress={() => setSelectedRoleId(role.id)}
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
            disabled={sendInvitationMutation.isPending || !shopId}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Existing Invitations</Text>
          {invitations.length === 0 ? <Text style={styles.empty}>No invitations yet.</Text> : null}
          {invitations.map((item) => (
            <View key={item.id} style={styles.listItem}>
              <Text style={styles.email}>{item.email}</Text>
              <Text style={styles.meta}>
                Role: {item.roleName} | Status: {item.status}
              </Text>
              <Text style={styles.meta}>Expires: {new Date(item.expiresOn).toLocaleString()}</Text>
              {item.status === "Pending" ? (
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
  card: {
    backgroundColor: "white",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D9E1E4",
    padding: 14,
    gap: 10,
  },
  title: { fontSize: 22, fontWeight: "700", color: "#0B1E24" },
  subtitle: { color: "#4F636B" },
  fieldLabel: { color: "#1E3540", fontSize: 12, lineHeight: 16, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderColor: "#C4D2D7",
    borderRadius: 8,
    backgroundColor: "#FAFCFD",
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  roleWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  roleChip: {
    borderWidth: 1,
    borderColor: "#0F3D3E",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  roleChipSelected: { backgroundColor: "#0F3D3E" },
  roleChipText: { color: "#0F3D3E", fontWeight: "600" },
  roleChipTextSelected: { color: "#FFF" },
  caption: { color: "#3E5962", fontSize: 12 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: "#0B1E24" },
  empty: { color: "#5F737A" },
  listItem: {
    borderWidth: 1,
    borderColor: "#E2E9EC",
    borderRadius: 10,
    padding: 10,
    gap: 4,
  },
  email: { fontWeight: "700", color: "#102A35" },
  meta: { color: "#4D626A" },
  cancelButton: {
    alignSelf: "flex-start",
    backgroundColor: "#9A2C2C",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 4,
  },
  cancelText: { color: "#FFF", fontWeight: "700" },
});
