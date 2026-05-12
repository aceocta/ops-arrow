import React, { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Constants from "expo-constants";
import { createCompany, listMyCompanies, updateCompany } from "../../api/companiesApi";
import { getConfigurations, updateConfigurations } from "../../api/configurationsApi";
import { resolvedApiBaseUrl } from "../../api/client";
import { DateTimeField } from "../../components/DateTimeField";
import { getRoleOptions } from "../../api/lookupsApi";
import { createShop, listShops, updateShop } from "../../api/shopsApi";
import { deactivateUser, listUsers, reactivateUser, updateUserRole } from "../../api/usersApi";
import { useAuth } from "../../auth/AuthContext";
import { LabeledValue } from "../../components/LabeledValue";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Company, ConfigurationItem, Shop } from "../../types/models";
import { MainStackParamList } from "../../types/navigation";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

const timeValuePattern = /^\d{2}:\d{2}$/;

function isTimeConfiguration(configKey: string, value: string) {
  return /time/i.test(configKey) && timeValuePattern.test(value);
}

function buildDisplayName(input: { firstName?: string; lastName?: string; displayName?: string; email?: string }) {
  if (input.displayName?.trim()) {
    return input.displayName.trim();
  }

  const joined = `${input.firstName ?? ""} ${input.lastName ?? ""}`.trim();
  if (joined) {
    return joined;
  }

  return input.email ?? "-";
}

export function UserManagementScreen() {
  const queryClient = useQueryClient();
  const { activeShopId, activeShop } = useAuth();
  const shopId = activeShopId;

  const usersQuery = useQuery({
    queryKey: ["users", shopId],
    queryFn: () => listUsers(shopId as string),
    enabled: Boolean(shopId),
  });

  const rolesQuery = useQuery({
    queryKey: ["roles"],
    queryFn: getRoleOptions,
    enabled: Boolean(shopId),
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, roleId }: { userId: string; roleId: string }) => {
      if (!shopId) throw new Error("Shop context missing.");
      return updateUserRole(userId, { shopId, roleId });
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["users", shopId] }),
    onError: (error: any) => Alert.alert("Failed", error?.response?.data?.message ?? "Unable to update role."),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      if (!shopId) throw new Error("Shop context missing.");
      if (isActive) return deactivateUser(userId, shopId);
      return reactivateUser(userId, shopId);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["users", shopId] }),
    onError: (error: any) => Alert.alert("Failed", error?.response?.data?.message ?? "Unable to change user status."),
  });

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ gap: 12 }}>
        <View style={ui.card}>
          <Text style={styles.meta}>Shop: {activeShop?.shopName ?? "-"}</Text>
          {(usersQuery.data ?? []).map((user) => (
            <View key={user.id} style={styles.item}>
              <Text style={styles.itemTitle}>{buildDisplayName(user)} ({user.email})</Text>
              <Text style={styles.meta}>Current Role: {user.roleName}</Text>
              <Text style={styles.meta}>Status: {user.isActive ? "Active" : "Inactive"}</Text>
              <Text style={styles.meta}>Last Login: {user.lastLoginOn ? new Date(user.lastLoginOn).toLocaleString() : "-"}</Text>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
                {(rolesQuery.data ?? []).map((role) => (
                  <Pressable
                    key={role.id}
                    style={styles.smallButton}
                    onPress={() => updateRoleMutation.mutate({ userId: user.id, roleId: role.id })}
                  >
                    <Text style={styles.smallButtonText}>Set {role.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              <Pressable
                style={[styles.smallButton, user.isActive ? styles.smallButtonDanger : styles.smallButtonSuccess]}
                onPress={() => toggleActiveMutation.mutate({ userId: user.id, isActive: user.isActive })}
              >
                <Text style={styles.smallButtonText}>{user.isActive ? "Deactivate" : "Reactivate"}</Text>
              </Pressable>
            </View>
          ))}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

export function AppConfigurationScreen() {
  const { activeShopId, activeShop } = useAuth();
  const queryClient = useQueryClient();
  const shopId = activeShopId;
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});

  const configurationsQuery = useQuery({
    queryKey: ["configurations", shopId],
    queryFn: () => getConfigurations(shopId ?? undefined),
    enabled: Boolean(shopId),
  });

  const grouped = useMemo(() => {
    const output = new Map<string, ConfigurationItem[]>();
    for (const item of configurationsQuery.data ?? []) {
      const arr = output.get(item.groupName) ?? [];
      arr.push(item);
      output.set(item.groupName, arr);
    }
    return output;
  }, [configurationsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!shopId) {
        throw new Error("Shop context missing.");
      }

      const changedItems = Object.entries(draftValues).map(([configKey, configValue]) => ({ configKey, configValue }));

      if (changedItems.length === 0) {
        throw new Error("No configuration changes to save.");
      }

      return updateConfigurations({
        shopId,
        items: changedItems,
      });
    },
    onSuccess: () => {
      setDraftValues({});
      Alert.alert("Saved", "Configuration updated.");
      void queryClient.invalidateQueries({ queryKey: ["configurations", shopId] });
    },
    onError: (error: any) => {
      Alert.alert("Failed", error?.response?.data?.message ?? error?.message ?? "Unable to update configuration.");
    },
  });

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ gap: 12 }}>
        <View style={ui.card}>
          <Text style={styles.meta}>Shop: {activeShop?.shopName ?? "-"}</Text>
          {[...grouped.entries()].map(([groupName, items]) => (
            <View key={groupName} style={styles.groupCard}>
              <Text style={styles.sectionTitle}>{groupName}</Text>
              {items.map((item) => {
                const draft = draftValues[item.configKey];
                const currentValue = draft ?? item.configValue;
                return (
                  <View key={item.id} style={{ gap: 4 }}>
                    <Text style={styles.meta}>{item.configKey}</Text>
                    {isTimeConfiguration(item.configKey, currentValue) ? (
                      <DateTimeField
                        mode="time"
                        value={currentValue}
                        onChange={(value) => setDraftValues((prev) => ({ ...prev, [item.configKey]: value }))}
                        placeholder="Select time"
                      />
                    ) : (
                      <TextInput
                        style={styles.input}
                        value={currentValue}
                        onChangeText={(value) => setDraftValues((prev) => ({ ...prev, [item.configKey]: value }))}
                        placeholder={item.configValue}
                      />
                    )}
                    {item.description ? <Text style={styles.caption}>{item.description}</Text> : null}
                  </View>
                );
              })}
            </View>
          ))}
          <Pressable style={styles.actionButton} onPress={() => saveMutation.mutate()}>
            <Text style={styles.actionButtonText}>{saveMutation.isPending ? "Saving..." : "Save Configuration"}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

export function CompanyManagementScreen() {
  const queryClient = useQueryClient();
  const [companyName, setCompanyName] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");

  const companiesQuery = useQuery({
    queryKey: ["companies", "mine"],
    queryFn: listMyCompanies,
  });

  const createCompanyMutation = useMutation({
    mutationFn: async () => {
      if (!companyName.trim()) {
        throw new Error("Company name is required.");
      }

      return createCompany({
        companyName: companyName.trim(),
        registrationNumber: registrationNumber.trim() || undefined,
      });
    },
    onSuccess: () => {
      setCompanyName("");
      setRegistrationNumber("");
      Alert.alert("Created", "Company created successfully.");
      void queryClient.invalidateQueries({ queryKey: ["companies", "mine"] });
    },
    onError: (error: any) => {
      Alert.alert("Failed", error?.response?.data?.message ?? error?.message ?? "Unable to create company.");
    },
  });

  const toggleCompanyMutation = useMutation({
    mutationFn: async (company: Company) =>
      updateCompany(company.id, {
        companyName: company.companyName,
        registrationNumber: company.registrationNumber,
        isActive: !company.isActive,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["companies", "mine"] });
    },
    onError: (error: any) => {
      Alert.alert("Failed", error?.response?.data?.message ?? "Unable to update company status.");
    },
  });

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ gap: 12 }}>
        <View style={ui.card}>
          <Text style={styles.fieldLabel}>Company Name</Text>
          <TextInput style={styles.input} value={companyName} onChangeText={setCompanyName} placeholder="Company name" />
          <Text style={styles.fieldLabel}>Registration Number</Text>
          <TextInput
            style={styles.input}
            value={registrationNumber}
            onChangeText={setRegistrationNumber}
            placeholder="Registration number (optional)"
          />
          <Pressable style={styles.actionButton} onPress={() => createCompanyMutation.mutate()}>
            <Text style={styles.actionButtonText}>{createCompanyMutation.isPending ? "Creating..." : "Create Company"}</Text>
          </Pressable>
        </View>

        <View style={ui.card}>
          <Text style={styles.sectionTitle}>My Companies</Text>
          {(companiesQuery.data ?? []).map((company) => (
            <View key={company.id} style={styles.item}>
              <Text style={styles.itemTitle}>{company.companyName}</Text>
              <Text style={styles.meta}>Reg No: {company.registrationNumber || "-"}</Text>
              <Text style={styles.meta}>Status: {company.isActive ? "Active" : "Inactive"}</Text>
              <Pressable style={styles.smallButton} onPress={() => toggleCompanyMutation.mutate(company)}>
                <Text style={styles.smallButtonText}>{company.isActive ? "Deactivate" : "Activate"}</Text>
              </Pressable>
            </View>
          ))}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

export function ShopManagementScreen() {
  const queryClient = useQueryClient();
  const { activeShop, refreshProfile } = useAuth();
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(activeShop?.companyId ?? "");
  const [editingShopId, setEditingShopId] = useState<string | null>(null);
  const [editingIsActive, setEditingIsActive] = useState(true);
  const [shopName, setShopName] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [postCode, setPostCode] = useState("");
  const [country, setCountry] = useState("UK");

  const companiesQuery = useQuery({
    queryKey: ["companies", "mine"],
    queryFn: listMyCompanies,
  });

  const companies = companiesQuery.data ?? [];

  const resolvedCompanyId = useMemo(() => {
    if (selectedCompanyId) {
      return selectedCompanyId;
    }
    return companies[0]?.id ?? "";
  }, [companies, selectedCompanyId]);

  const shopsQuery = useQuery({
    queryKey: ["shops", resolvedCompanyId],
    queryFn: () => listShops(resolvedCompanyId || undefined),
    enabled: companies.length > 0,
  });

  const saveShopMutation = useMutation({
    mutationFn: async () => {
      if (!resolvedCompanyId) {
        throw new Error("Select a company first.");
      }
      if (!shopName.trim() || !addressLine1.trim() || !city.trim() || !postCode.trim() || !country.trim()) {
        throw new Error("Shop name, address, city, postcode, and country are required.");
      }

      const payload = {
        companyId: resolvedCompanyId,
        shopName: shopName.trim(),
        addressLine1: addressLine1.trim(),
        addressLine2: addressLine2.trim() || undefined,
        city: city.trim(),
        postCode: postCode.trim(),
        country: country.trim(),
      };

      if (editingShopId) {
        return updateShop(editingShopId, {
          ...payload,
          isActive: editingIsActive,
        });
      }

      return createShop(payload);
    },
    onSuccess: () => {
      setEditingShopId(null);
      setEditingIsActive(true);
      setShopName("");
      setAddressLine1("");
      setAddressLine2("");
      setCity("");
      setPostCode("");
      setCountry("UK");
      Alert.alert(editingShopId ? "Updated" : "Created", editingShopId ? "Shop updated successfully." : "Shop created successfully.");
      void Promise.all([queryClient.invalidateQueries({ queryKey: ["shops", resolvedCompanyId] }), refreshProfile()]);
    },
    onError: (error: any) => {
      Alert.alert("Failed", error?.response?.data?.message ?? error?.message ?? `Unable to ${editingShopId ? "update" : "create"} shop.`);
    },
  });

  function beginEditShop(shop: Shop) {
    setEditingShopId(shop.id);
    setEditingIsActive(shop.isActive);
    setShopName(shop.shopName);
    setAddressLine1(shop.addressLine1);
    setAddressLine2(shop.addressLine2 ?? "");
    setCity(shop.city);
    setPostCode(shop.postCode);
    setCountry(shop.country);
  }

  function cancelEditShop() {
    setEditingShopId(null);
    setEditingIsActive(true);
    setShopName("");
    setAddressLine1("");
    setAddressLine2("");
    setCity("");
    setPostCode("");
    setCountry("UK");
  }

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ gap: 12 }}>
        <View style={ui.card}>
          <Text style={styles.meta}>Select Company</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
            {companies.map((company) => {
              const selected = company.id === resolvedCompanyId;
              return (
                <Pressable
                  key={company.id}
                  style={[styles.choiceChip, selected ? styles.choiceChipSelected : null]}
                  onPress={() => setSelectedCompanyId(company.id)}
                >
                  <Text style={[styles.choiceChipText, selected ? styles.choiceChipTextSelected : null]}>{company.companyName}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Text style={styles.fieldLabel}>Shop Name</Text>
          <TextInput style={styles.input} value={shopName} onChangeText={setShopName} placeholder="Shop name" />
          <Text style={styles.fieldLabel}>Address Line 1</Text>
          <TextInput style={styles.input} value={addressLine1} onChangeText={setAddressLine1} placeholder="Address line 1" />
          <Text style={styles.fieldLabel}>Address Line 2</Text>
          <TextInput style={styles.input} value={addressLine2} onChangeText={setAddressLine2} placeholder="Address line 2 (optional)" />
          <Text style={styles.fieldLabel}>City</Text>
          <TextInput style={styles.input} value={city} onChangeText={setCity} placeholder="City" />
          <Text style={styles.fieldLabel}>Post Code</Text>
          <TextInput style={styles.input} value={postCode} onChangeText={setPostCode} placeholder="Post code" />
          <Text style={styles.fieldLabel}>Country</Text>
          <TextInput style={styles.input} value={country} onChangeText={setCountry} placeholder="Country" />

          {editingShopId ? (
            <View style={styles.row}>
              <Pressable
                style={[styles.choiceChip, editingIsActive ? styles.choiceChipSelected : null]}
                onPress={() => setEditingIsActive(true)}
              >
                <Text style={[styles.choiceChipText, editingIsActive ? styles.choiceChipTextSelected : null]}>Active</Text>
              </Pressable>
              <Pressable
                style={[styles.choiceChip, !editingIsActive ? styles.choiceChipSelected : null]}
                onPress={() => setEditingIsActive(false)}
              >
                <Text style={[styles.choiceChipText, !editingIsActive ? styles.choiceChipTextSelected : null]}>Inactive</Text>
              </Pressable>
            </View>
          ) : null}

          <Pressable style={styles.actionButton} onPress={() => saveShopMutation.mutate()}>
            <Text style={styles.actionButtonText}>
              {saveShopMutation.isPending
                ? (editingShopId ? "Updating..." : "Creating...")
                : (editingShopId ? "Update Shop" : "Create Shop")}
            </Text>
          </Pressable>
          {editingShopId ? (
            <Pressable style={[styles.actionButton, styles.smallButtonDanger]} onPress={cancelEditShop}>
              <Text style={styles.actionButtonText}>Cancel Edit</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={ui.card}>
          <Text style={styles.sectionTitle}>Company Shops</Text>
          {(shopsQuery.data ?? []).map((shop) => (
            <View key={shop.id} style={styles.item}>
              <Text style={styles.itemTitle}>{shop.shopName}</Text>
              <Text style={styles.meta}>{shop.addressLine1}, {shop.city}</Text>
              <Text style={styles.meta}>{shop.postCode}, {shop.country}</Text>
              <Text style={styles.meta}>Status: {shop.isActive ? "Active" : "Inactive"}</Text>
              <View style={styles.row}>
                <Pressable style={styles.smallButton} onPress={() => beginEditShop(shop)}>
                  <Text style={styles.smallButtonText}>Edit</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

export function SettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { profile, activeShop, signOut } = useAuth();

  const shopCount = profile?.shops?.length ?? 0;
  const primaryRole = profile?.roles?.[0] ?? "-";
  const isShopOwner = profile?.roles?.some((role) => role === "ShopOwner") ?? false;
  const appVersion = Constants.expoConfig?.version ?? "1.0.0";
  type OperationsMenuScreen = "Deliveries" | "TemperatureLogs" | "RefusalRegister" | "ScratchCardPacks" | "ScratchCardGames" | "BusinessDay" | "OpenShift" | "CloseShift";
  const operationActions: Array<{ label: string; screen: OperationsMenuScreen }> = [
    { label: "Deliveries", screen: "Deliveries" },
    { label: "Temperature Logs", screen: "TemperatureLogs" },
    { label: "No ID / No Sale", screen: "RefusalRegister" },
    { label: "Card Packs", screen: "ScratchCardPacks" },
    { label: "Card Games", screen: "ScratchCardGames" },
    { label: "Business Day", screen: "BusinessDay" },
    { label: "Open Shift", screen: "OpenShift" },
    { label: "Close Shift", screen: "CloseShift" },
  ];

  async function onSignOut() {
    try {
      await signOut();
    } catch {
      Alert.alert("Sign out failed", "Unable to complete sign out. Please try again.");
    }
  }

  return (
    <ScreenContainer>
      <View style={ui.card}>
        <LabeledValue label="User" value={profile ? buildDisplayName(profile) : "-"} />
        <LabeledValue label="Email" value={profile?.email ?? "-"} />
        <LabeledValue label="Primary role" value={primaryRole} />
        <LabeledValue label="Active shop" value={activeShop?.shopName ?? "-"} />
        <LabeledValue label="Active company" value={activeShop?.companyName ?? "-"} />
        <LabeledValue label="Shops assigned" value={shopCount} />
      </View>

      <View style={ui.card}>
        <Text style={styles.sectionTitle}>Management</Text>
        <Pressable style={styles.actionButton} onPress={() => (navigation.getParent() as any)?.navigate("ShopSelector")}>
          <Text style={styles.actionButtonText}>Switch Shop</Text>
        </Pressable>
        <Pressable style={styles.actionButton} onPress={() => navigation.navigate("UserInvitations")}>
          <Text style={styles.actionButtonText}>User Invitations</Text>
        </Pressable>
        {isShopOwner ? (
          <>
            <Pressable style={styles.actionButton} onPress={() => navigation.navigate("CompanyManagement")}>
              <Text style={styles.actionButtonText}>Company Management</Text>
            </Pressable>
            <Pressable style={styles.actionButton} onPress={() => navigation.navigate("ShopManagement")}>
              <Text style={styles.actionButtonText}>Shop Management</Text>
            </Pressable>
            <Pressable style={styles.actionButton} onPress={() => navigation.navigate("UserManagement")}>
              <Text style={styles.actionButtonText}>User Management</Text>
            </Pressable>
            <Pressable style={styles.actionButton} onPress={() => navigation.navigate("AppConfiguration")}>
              <Text style={styles.actionButtonText}>App Configuration</Text>
            </Pressable>
          </>
        ) : null}
      </View>

      <View style={ui.card}>
        <Text style={styles.sectionTitle}>Operations</Text>
        {operationActions.map((action) => (
          <Pressable key={action.screen} style={styles.actionButton} onPress={() => navigation.navigate(action.screen)}>
            <Text style={styles.actionButtonText}>{action.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={ui.card}>
        <Text style={styles.sectionTitle}>Reports</Text>
        <Pressable style={styles.actionButton} onPress={() => navigation.navigate("DailySalesReport")}>
          <Text style={styles.actionButtonText}>Daily Sales Report</Text>
        </Pressable>
        <Pressable style={styles.actionButton} onPress={() => navigation.navigate("StockReport")}>
          <Text style={styles.actionButtonText}>Stock Report</Text>
        </Pressable>
        <Pressable style={styles.actionButton} onPress={() => navigation.navigate("ManualClosingReview")}>
          <Text style={styles.actionButtonText}>Manual Entry Review</Text>
        </Pressable>
        <Pressable style={styles.actionButton} onPress={() => navigation.navigate("NotificationLog")}>
          <Text style={styles.actionButtonText}>Notification Log</Text>
        </Pressable>
      </View>

      <View style={ui.card}>
        <Text style={styles.sectionTitle}>Environment</Text>
        <LabeledValue label="App version" value={appVersion} />
        <LabeledValue label="API base URL" value={resolvedApiBaseUrl} />
        <LabeledValue label="Mode" value={__DEV__ ? "Development" : "Production"} />
      </View>

      <Pressable style={styles.logoutButton} onPress={onSignOut}>
        <Text style={styles.logoutButtonText}>Sign Out</Text>
      </Pressable>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, lineHeight: 28, color: appTheme.colors.text, fontFamily: appTheme.fonts.heading },
  sectionTitle: { fontSize: 17, lineHeight: 22, color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium },
  actionButton: {
    backgroundColor: appTheme.colors.primary,
    borderRadius: appTheme.radius.sm,
    borderWidth: 1,
    borderColor: "#0A3B3D",
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  actionButtonText: { color: "#ECFEFC", fontFamily: appTheme.fonts.bodyMedium, fontSize: 14, lineHeight: 18 },
  groupCard: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    padding: 10,
    gap: 8,
  },
  item: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    padding: 10,
    gap: 4,
  },
  itemTitle: { fontFamily: appTheme.fonts.bodyMedium, color: appTheme.colors.text, fontSize: 14, lineHeight: 18 },
  meta: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 13, lineHeight: 18 },
  fieldLabel: {
    color: appTheme.colors.text,
    fontSize: 13,
    lineHeight: 16,
    fontFamily: appTheme.fonts.bodyMedium,
    marginTop: 2,
  },
  caption: { color: appTheme.colors.textSubtle, fontSize: 12, lineHeight: 16, fontFamily: appTheme.fonts.body },
  row: { flexDirection: "row", gap: 8 },
  choiceChip: {
    borderWidth: 1,
    borderColor: appTheme.colors.primary,
    borderRadius: appTheme.radius.pill,
    backgroundColor: "#E9F7F6",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  choiceChipSelected: {
    backgroundColor: appTheme.colors.primary,
  },
  choiceChipText: {
    color: appTheme.colors.primary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 14,
  },
  choiceChipTextSelected: {
    color: "#F4FFFE",
  },
  input: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
    color: appTheme.colors.text,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.sm,
    fontFamily: appTheme.fonts.body,
    fontSize: 14,
  },
  smallButton: {
    backgroundColor: appTheme.colors.primary,
    borderRadius: appTheme.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  smallButtonDanger: { backgroundColor: appTheme.colors.danger },
  smallButtonSuccess: { backgroundColor: appTheme.colors.success },
  smallButtonText: { color: "#FFF", fontFamily: appTheme.fonts.bodyMedium, fontSize: 12, lineHeight: 14 },
  logoutButton: {
    backgroundColor: appTheme.colors.danger,
    borderRadius: appTheme.radius.sm,
    paddingVertical: 12,
    alignItems: "center",
  },
  logoutButtonText: { color: "#FFF", fontFamily: appTheme.fonts.bodyMedium, fontSize: 16, lineHeight: 18 },
});
