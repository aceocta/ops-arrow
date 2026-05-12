import React, { useMemo, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import { createDelivery, parseDeliveryNote } from "../../api/deliveriesApi";
import { listGames } from "../../api/gamesApi";
import { DateTimeField, formatDateValue } from "../../components/DateTimeField";
import { ScreenContainer } from "../../components/ScreenContainer";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

type DraftPackRow = {
  id: string;
  gameId: string;
  gameCode: string;
  gameName: string;
  isNewGameCandidate: boolean;
  packNumber: string;
  displayNumber: string;
  ticketPrice: string;
  totalTickets: string;
  startSerialNumber: string;
  endSerialNumber: string;
};

function normalizeGameCodeInput(value: string) {
  return value.replace(/[^0-9A-Za-z]/g, "").trim().toUpperCase();
}

function createDefaultPackRow(seed: number): DraftPackRow {
  return {
    id: `row-${seed}-${Date.now()}`,
    gameId: "",
    gameCode: "",
    gameName: "",
    isNewGameCandidate: false,
    packNumber: "",
    displayNumber: "",
    ticketPrice: "0",
    totalTickets: "100",
    startSerialNumber: "000",
    endSerialNumber: "099",
  };
}

export function ReceiveDeliveryScreen() {
  const queryClient = useQueryClient();
  const { profile, activeShopId, activeShop } = useAuth();
  const shopId = activeShopId;
  const userId = profile?.userId;

  const [deliveryDate, setDeliveryDate] = useState(formatDateValue(new Date()));
  const [supplierName, setSupplierName] = useState("");
  const [deliveryReference, setDeliveryReference] = useState("");
  const [notes, setNotes] = useState("");
  const [packRows, setPackRows] = useState<DraftPackRow[]>([createDefaultPackRow(1)]);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editingRow, setEditingRow] = useState<DraftPackRow | null>(null);
  const [editingGameSearch, setEditingGameSearch] = useState("");
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);

  const gamesQuery = useQuery({
    queryKey: ["games", shopId],
    queryFn: () => listGames(shopId as string),
    enabled: Boolean(shopId),
  });

  const gameOptions = gamesQuery.data ?? [];
  const activeGameOptions = useMemo(() => gameOptions.filter((game) => game.isActive), [gameOptions]);

  const gameMap = useMemo(() => {
    return new Map(gameOptions.map((game) => [game.id, game]));
  }, [gameOptions]);
  const selectedEditingGame = activeGameOptions.find((game) => game.id === editingRow?.gameId);
  const selectedEditingGameLabel = selectedEditingGame ? `${selectedEditingGame.gameCode} - ${selectedEditingGame.gameName}` : "";
  const filteredEditingGames = useMemo(() => {
    const normalized = editingGameSearch.trim().toLowerCase();
    if (!normalized) {
      return activeGameOptions.slice(0, 8);
    }
    return activeGameOptions
      .filter((game) =>
        game.gameCode.toLowerCase().includes(normalized) || game.gameName.toLowerCase().includes(normalized)
      )
      .slice(0, 12);
  }, [activeGameOptions, editingGameSearch]);
  const isSearchMatchingSelectedGame =
    Boolean(selectedEditingGame) && editingGameSearch.trim().toLowerCase() === selectedEditingGameLabel.toLowerCase();
  const showEditingGameSuggestions =
    Boolean(editingRow) &&
    activeGameOptions.length > 0 &&
    !isSearchMatchingSelectedGame &&
    (editingGameSearch.trim().length > 0 || !editingRow?.gameId);

  const duplicatePackNumbers = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of packRows) {
      const normalized = row.packNumber.trim().toUpperCase();
      if (!normalized) continue;
      map.set(normalized, (map.get(normalized) ?? 0) + 1);
    }
    return new Set([...map.entries()].filter(([, count]) => count > 1).map(([key]) => key));
  }, [packRows]);

  const parseDeliveryNoteMutation = useMutation({
    mutationFn: (input: { uri: string; fileName?: string; mimeType?: string }) => {
      if (!shopId) {
        throw new Error("Shop context is missing.");
      }

      return parseDeliveryNote({
        shopId,
        uri: input.uri,
        fileName: input.fileName,
        mimeType: input.mimeType,
      });
    },
    onSuccess: (result) => {
      const normalizedRows: DraftPackRow[] = result.packSuggestions.map((suggestion, index) => ({
        id: `row-ai-${index}-${Date.now()}`,
        gameId: suggestion.gameId ?? "",
        gameCode: suggestion.gameCode ?? "",
        gameName: suggestion.gameName ?? "",
        isNewGameCandidate: suggestion.isNewGameCandidate ?? false,
        packNumber: suggestion.packNumber ?? "",
        displayNumber: "",
        ticketPrice: `${suggestion.ticketPrice ?? 0}`,
        totalTickets: `${suggestion.totalTickets ?? 100}`,
        startSerialNumber: suggestion.startSerialNumber ?? "000",
        endSerialNumber: suggestion.endSerialNumber ?? "099",
      }));

      if (normalizedRows.length > 0) {
        setPackRows(normalizedRows);
      }

      if (result.deliveryDate) {
        setDeliveryDate(result.deliveryDate);
      }

      if (result.supplierName) {
        setSupplierName(result.supplierName);
      }

      const parsedReference = result.deliveryReference || result.shipmentNumber;
      if (parsedReference) {
        setDeliveryReference(parsedReference);
      }

      setParseWarnings(result.warnings ?? []);

      if ((result.warnings?.length ?? 0) > 0) {
        Alert.alert("Delivery note parsed with warnings", result.warnings.slice(0, 5).join("\n"));
      } else {
        Alert.alert("Delivery note parsed", `Detected ${normalizedRows.length} pack row(s).`);
      }
    },
    onError: (error: any) => {
      Alert.alert(
        "Auto-fill failed",
        error?.response?.data?.message ?? error?.message ?? "Unable to parse delivery note image.");
    },
  });

  const createDeliveryMutation = useMutation({
    mutationFn: async (input: { allowAutoCreateGames: boolean }) => {
      if (!shopId || !userId) {
        throw new Error("User or shop context is missing.");
      }

      if (!supplierName.trim() || !deliveryReference.trim()) {
        throw new Error("Supplier name and delivery reference are required.");
      }

      if (packRows.length === 0) {
        throw new Error("At least one pack row is required.");
      }

      if (duplicatePackNumbers.size > 0) {
        throw new Error("Duplicate pack numbers are not allowed within a delivery.");
      }

      const packs = packRows.map((row) => {
        if (!row.packNumber.trim()) {
          throw new Error("Pack number is required.");
        }

        const normalizedGameCode = normalizeGameCodeInput(row.gameCode);
        if (!row.gameId && !normalizedGameCode) {
          throw new Error("Each pack must have a selected game or parsed game code.");
        }
        if (!row.gameId && (normalizedGameCode.length < 2 || normalizedGameCode.length > 20)) {
          throw new Error("Game code must be 2 to 20 letters/numbers.");
        }
        if (row.displayNumber.trim().length > 0) {
          const parsedDisplayNumber = Number(row.displayNumber);
          if (!Number.isInteger(parsedDisplayNumber) || parsedDisplayNumber < 0) {
            throw new Error("Display number must be a non-negative whole number.");
          }
        }

        return {
          gameId: row.gameId || undefined,
          gameCode: normalizedGameCode || undefined,
          gameName: row.gameName.trim() || undefined,
          packNumber: row.packNumber.trim().toUpperCase(),
          displayNumber: row.displayNumber.trim().length > 0 ? Number(row.displayNumber) : undefined,
          ticketPrice: Number(row.ticketPrice),
          totalTickets: Number(row.totalTickets),
          startSerialNumber: row.startSerialNumber.trim(),
          endSerialNumber: row.endSerialNumber.trim(),
          notes: undefined,
        };
      });

      return createDelivery({
        shopId,
        deliveryDate: `${deliveryDate}T00:00:00Z`,
        supplierName: supplierName.trim(),
        deliveryReference: deliveryReference.trim(),
        receivedByUserId: userId,
        notes: notes.trim() || undefined,
        allowAutoCreateGames: input.allowAutoCreateGames,
        packs,
      });
    },
    onSuccess: () => {
      setSupplierName("");
      setDeliveryReference("");
      setNotes("");
      setPackRows([createDefaultPackRow(1)]);
      setParseWarnings([]);
      setEditingRow(null);
      setEditingRowId(null);
      Alert.alert("Delivery saved", "Delivery and packs were created successfully.");
      void queryClient.invalidateQueries({ queryKey: ["deliveries", shopId] });
      void queryClient.invalidateQueries({ queryKey: ["packs", shopId] });
    },
    onError: (error: any) => {
      Alert.alert("Failed", error?.response?.data?.message ?? error?.message ?? "Unable to create delivery.");
    },
  });

  async function openDeliveryNoteCapture(source: "camera" | "gallery") {
    if (!shopId) {
      Alert.alert("Shop missing", "Select a shop before scanning a delivery note.");
      return;
    }

    const permission =
      source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert("Permission required", source === "camera" ? "Camera permission is required." : "Photo access is required.");
      return;
    }

    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: "images",
            quality: 0.85,
            allowsEditing: false,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: "images",
            quality: 0.85,
            allowsEditing: false,
          });

    if (result.canceled || result.assets.length === 0) {
      return;
    }

    const asset = result.assets[0];
    parseDeliveryNoteMutation.mutate({
      uri: asset.uri,
      fileName: asset.fileName ?? `delivery-note-${Date.now()}.jpg`,
      mimeType: asset.mimeType ?? "image/jpeg",
    });
  }

  function handleSaveDelivery() {
    const rowsRequiringNewGame = packRows.filter(
      (row) => !row.gameId && normalizeGameCodeInput(row.gameCode).length > 0,
    );

    if (rowsRequiringNewGame.length === 0) {
      createDeliveryMutation.mutate({ allowAutoCreateGames: false });
      return;
    }

    const invalidPriceRow = rowsRequiringNewGame.find((row) => Number(row.ticketPrice) <= 0);
    if (invalidPriceRow) {
      const invalidCode = normalizeGameCodeInput(invalidPriceRow.gameCode);
      Alert.alert(
        "Ticket price required",
        `Set a valid ticket price for new game ${invalidCode || invalidPriceRow.gameCode} before saving.`,
      );
      return;
    }

    const previewCodes = rowsRequiringNewGame
      .slice(0, 4)
      .map((row) => normalizeGameCodeInput(row.gameCode))
      .join(", ");
    const extraCount = rowsRequiringNewGame.length > 4 ? ` and ${rowsRequiringNewGame.length - 4} more` : "";

    Alert.alert(
      "Create Master Catalog Games?",
      `The system will create ${rowsRequiringNewGame.length} master game(s) and assign them to this shop: ${previewCodes}${extraCount}. Continue?`,
      [
        { text: "No", style: "cancel" },
        { text: "Yes", onPress: () => createDeliveryMutation.mutate({ allowAutoCreateGames: true }) },
      ],
    );
  }

  function removeRow(rowId: string) {
    setPackRows((prev) => {
      if (prev.length === 1) {
        Alert.alert("Cannot remove", "At least one pack row is required.");
        return prev;
      }
      return prev.filter((row) => row.id !== rowId);
    });

    if (editingRowId === rowId) {
      setEditingRowId(null);
      setEditingRow(null);
    }
  }

  function openRowEditor(rowId: string) {
    const row = packRows.find((item) => item.id === rowId);
    if (!row) {
      return;
    }

    setEditingRowId(rowId);
    setEditingRow({ ...row });
    const matchedGame = activeGameOptions.find((game) => game.id === row.gameId);
    setEditingGameSearch(matchedGame ? `${matchedGame.gameCode} - ${matchedGame.gameName}` : row.gameCode ?? "");
  }

  function addRowAndOpenEditor() {
    const nextRow = createDefaultPackRow(packRows.length + 1);
    setPackRows((prev) => [...prev, nextRow]);
    setEditingRowId(nextRow.id);
    setEditingRow(nextRow);
  }

  function updateEditingRow(updater: (row: DraftPackRow) => DraftPackRow) {
    setEditingRow((prev) => (prev ? updater(prev) : prev));
  }

  function closeRowEditor() {
    setEditingRowId(null);
    setEditingRow(null);
    setEditingGameSearch("");
  }

  function saveRowEditor() {
    if (!editingRowId || !editingRow) {
      closeRowEditor();
      return;
    }

    const normalizedRow: DraftPackRow = {
      ...editingRow,
      packNumber: editingRow.packNumber.toUpperCase(),
    };

    setPackRows((prev) => prev.map((row) => (row.id === editingRowId ? normalizedRow : row)));
    closeRowEditor();
  }

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ gap: 12 }}>
        <View style={ui.card}>
          <Text style={styles.meta}>Shop: {activeShop?.shopName ?? "-"}</Text>
          <Text style={styles.fieldLabel}>Delivery Date</Text>
          <DateTimeField mode="date" value={deliveryDate} onChange={setDeliveryDate} />
          <Text style={styles.fieldLabel}>Supplier Name</Text>
          <TextInput style={styles.input} value={supplierName} onChangeText={setSupplierName} placeholder="Supplier name" />
          <Text style={styles.fieldLabel}>Delivery Reference</Text>
          <TextInput style={styles.input} value={deliveryReference} onChangeText={setDeliveryReference} placeholder="Delivery reference" />
          <Text style={styles.fieldLabel}>Notes</Text>
          <TextInput style={styles.input} value={notes} onChangeText={setNotes} placeholder="Notes (optional)" />
          <View style={styles.rowActions}>
            <Pressable
              style={styles.actionButton}
              onPress={() => openDeliveryNoteCapture("camera")}
              disabled={parseDeliveryNoteMutation.isPending}
            >
              <Text style={styles.actionButtonText}>
                {parseDeliveryNoteMutation.isPending ? "Reading..." : "Scan Delivery Note"}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.actionButton, styles.secondaryActionButton]}
              onPress={() => openDeliveryNoteCapture("gallery")}
              disabled={parseDeliveryNoteMutation.isPending}
            >
              <Text style={styles.secondaryActionText}>Import Photo</Text>
            </Pressable>
          </View>
          {parseWarnings.length > 0 ? (
            <View style={styles.warningBox}>
              <Text style={styles.warningTitle}>Auto-fill Warnings</Text>
              {parseWarnings.slice(0, 5).map((warning) => (
                <Text key={warning} style={styles.warningText}>{`\u2022 ${warning}`}</Text>
              ))}
            </View>
          ) : null}
        </View>

        <View style={ui.card}>
          <Text style={styles.sectionTitle}>Pack Rows</Text>
          {packRows.map((row, index) => {
            const duplicate = duplicatePackNumbers.has(row.packNumber.trim().toUpperCase());
            const game = gameMap.get(row.gameId);
            const canRemove = packRows.length > 1;
            const needsNewGame = !row.gameId && normalizeGameCodeInput(row.gameCode).length > 0;
            const gameLabel = game
              ? `${game.gameCode} - ${game.gameName}`
              : needsNewGame
                ? `${row.gameCode}${row.gameName ? ` - ${row.gameName}` : ""}`
                : "Not selected";

            return (
              <View style={[styles.rowCard, needsNewGame && styles.newGameRowCard]} key={row.id}>
                <Text style={styles.rowTitle}>Pack Row {index + 1}</Text>
                <Text style={styles.meta}>Game: {gameLabel}</Text>
                <Text style={styles.meta}>Pack Number: {row.packNumber || "-"}</Text>
                <Text style={styles.meta}>Display Number: {row.displayNumber || "-"}</Text>
                <Text style={styles.meta}>Price: £ {Number(row.ticketPrice || 0).toFixed(2)} | Tickets: {row.totalTickets || "-"}</Text>
                <Text style={styles.meta}>Serial: {row.startSerialNumber || "-"} {"->"} {row.endSerialNumber || "-"}</Text>
                {needsNewGame ? (
                  <Text style={styles.newGameWarning}>New master game will be created and assigned to this shop on save.</Text>
                ) : null}
                {duplicate ? <Text style={styles.error}>Duplicate pack number in this delivery.</Text> : null}

                <View style={styles.rowActions}>
                  <Pressable style={styles.actionButton} onPress={() => openRowEditor(row.id)}>
                    <Text style={styles.actionButtonText}>Edit Row</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.actionButton, styles.removeButton, !canRemove && styles.disabledButton]}
                    onPress={() => removeRow(row.id)}
                    disabled={!canRemove}
                  >
                    <Text style={styles.removeText}>Remove</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}

          <PrimaryButton label="Add Pack Row" tone="neutral" onPress={addRowAndOpenEditor} />
          <PrimaryButton
            label={createDeliveryMutation.isPending ? "Saving..." : "Save Delivery"}
            onPress={handleSaveDelivery}
            disabled={createDeliveryMutation.isPending || !shopId}
          />
        </View>

      </ScrollView>

      <Modal visible={Boolean(editingRow)} animationType="slide" transparent onRequestClose={closeRowEditor}>
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Pack Row Editor</Text>
              <Pressable onPress={closeRowEditor}>
                <Text style={styles.closeText}>Close</Text>
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.modalContent}>
              <Text style={styles.fieldLabel}>Game</Text>
              <TextInput
                style={styles.input}
                value={editingGameSearch}
                onChangeText={(value) => {
                  setEditingGameSearch(value);
                  if (selectedEditingGame && value !== selectedEditingGameLabel) {
                    updateEditingRow((current) => ({
                      ...current,
                      gameId: "",
                      gameCode: value,
                      gameName: current.gameName,
                      isNewGameCandidate: normalizeGameCodeInput(value).length > 0,
                    }));
                  }
                }}
                placeholder="Search game by code or name"
                placeholderTextColor={appTheme.colors.textSubtle}
              />
              {showEditingGameSuggestions ? (
                <View style={styles.autocompleteList}>
                  {filteredEditingGames.map((game) => (
                    <Pressable
                      key={game.id}
                      style={styles.autocompleteItem}
                      onPress={() => {
                        setEditingGameSearch(`${game.gameCode} - ${game.gameName}`);
                        updateEditingRow((current) => ({
                          ...current,
                          gameId: game.id,
                          gameCode: game.gameCode,
                          gameName: game.gameName,
                          isNewGameCandidate: false,
                          ticketPrice: `${game.defaultTicketPrice}`,
                          totalTickets: `${game.defaultTicketsPerPack}`,
                          startSerialNumber: game.defaultStartSerialNumber,
                          endSerialNumber: game.defaultEndSerialNumber,
                        }));
                      }}
                    >
                      <Text style={styles.autocompleteItemText}>{game.gameCode} - {game.gameName}</Text>
                    </Pressable>
                  ))}
                  {filteredEditingGames.length === 0 ? <Text style={styles.meta}>No matching games.</Text> : null}
                </View>
              ) : null}

              {!editingRow?.gameId && normalizeGameCodeInput(editingRow?.gameCode ?? "").length > 0 ? (
                <View style={styles.warningBox}>
                  <Text style={styles.warningTitle}>New Game Candidate</Text>
                  <Text style={styles.warningText}>
                    {normalizeGameCodeInput(editingRow?.gameCode ?? "")}{editingRow?.gameName ? ` - ${editingRow.gameName}` : ""}
                  </Text>
                  <Text style={styles.warningText}>
                    This game can be created in master catalog and assigned to this shop when you save.
                  </Text>
                </View>
              ) : null}

              <Text style={styles.fieldLabel}>Pack Number</Text>
              <TextInput
                style={styles.input}
                value={editingRow?.packNumber ?? ""}
                onChangeText={(v) => updateEditingRow((current) => ({ ...current, packNumber: v }))}
                placeholder="Pack number"
              />
              <Text style={styles.fieldLabel}>Display Number (Optional)</Text>
              <TextInput
                style={styles.input}
                value={editingRow?.displayNumber ?? ""}
                keyboardType="number-pad"
                onChangeText={(v) => updateEditingRow((current) => ({ ...current, displayNumber: v }))}
                placeholder="Display number"
              />
              <Text style={styles.fieldLabel}>Ticket Price</Text>
              <TextInput
                style={styles.input}
                value={editingRow?.ticketPrice ?? ""}
                keyboardType="decimal-pad"
                onChangeText={(v) => updateEditingRow((current) => ({ ...current, ticketPrice: v }))}
                placeholder="Ticket price"
              />
              <Text style={styles.fieldLabel}>Total Tickets</Text>
              <TextInput
                style={styles.input}
                value={editingRow?.totalTickets ?? ""}
                keyboardType="number-pad"
                onChangeText={(v) => updateEditingRow((current) => ({ ...current, totalTickets: v }))}
                placeholder="Total tickets"
              />
              <Text style={styles.fieldLabel}>Start Serial</Text>
              <TextInput
                style={styles.input}
                value={editingRow?.startSerialNumber ?? ""}
                onChangeText={(v) => updateEditingRow((current) => ({ ...current, startSerialNumber: v }))}
                placeholder="Start serial"
              />
              <Text style={styles.fieldLabel}>End Serial</Text>
              <TextInput
                style={styles.input}
                value={editingRow?.endSerialNumber ?? ""}
                onChangeText={(v) => updateEditingRow((current) => ({ ...current, endSerialNumber: v }))}
                placeholder="End serial"
              />

              <PrimaryButton label="Save Row" onPress={saveRowEditor} />
              <PrimaryButton label="Cancel" tone="neutral" onPress={closeRowEditor} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, lineHeight: 28, fontFamily: appTheme.fonts.heading, color: appTheme.colors.text },
  sectionTitle: { fontSize: 17, lineHeight: 22, fontFamily: appTheme.fonts.bodyMedium, color: appTheme.colors.text },
  fieldLabel: {
    color: appTheme.colors.text,
    fontSize: 13,
    lineHeight: 16,
    fontFamily: appTheme.fonts.bodyMedium,
    marginTop: 2,
  },
  input: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    color: appTheme.colors.text,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.sm,
    fontSize: 14,
    fontFamily: appTheme.fonts.body,
  },
  rowCard: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    padding: 10,
    gap: 6,
  },
  newGameRowCard: {
    borderColor: "#F4C152",
    backgroundColor: "#FFF9EC",
  },
  newGameWarning: {
    color: "#7A5200",
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  rowTitle: { color: appTheme.colors.text, fontSize: 14, lineHeight: 18, fontFamily: appTheme.fonts.bodyMedium },
  rowActions: { flexDirection: "row", gap: 8, marginTop: 4 },
  actionButton: {
    backgroundColor: appTheme.colors.primary,
    borderRadius: appTheme.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  actionButtonText: { color: "#FFF", fontFamily: appTheme.fonts.bodyMedium, fontSize: 12, lineHeight: 14 },
  secondaryActionButton: {
    backgroundColor: "#ECF7F6",
    borderWidth: 1,
    borderColor: appTheme.colors.primary,
  },
  secondaryActionText: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 12, lineHeight: 14 },
  warningBox: {
    borderWidth: 1,
    borderColor: "#F4C152",
    backgroundColor: "#FFF7E6",
    borderRadius: appTheme.radius.sm,
    padding: 10,
    gap: 4,
  },
  warningTitle: {
    color: "#6B4A00",
    fontSize: 13,
    lineHeight: 17,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  warningText: {
    color: "#7A5200",
    fontSize: 12,
    lineHeight: 16,
    fontFamily: appTheme.fonts.body,
  },
  autocompleteList: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    padding: appTheme.spacing.xs,
    gap: 4,
  },
  autocompleteItem: {
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: 8,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
  },
  autocompleteItemText: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.body,
    fontSize: 13,
    lineHeight: 17,
  },
  removeButton: {
    alignSelf: "flex-start",
    backgroundColor: appTheme.colors.danger,
  },
  disabledButton: {
    opacity: 0.45,
  },
  removeText: { color: "#FFF", fontFamily: appTheme.fonts.bodyMedium, fontSize: 12, lineHeight: 14 },
  error: { color: appTheme.colors.danger, fontFamily: appTheme.fonts.bodyMedium },
  meta: { color: appTheme.colors.textMuted, fontSize: 13, lineHeight: 18, fontFamily: appTheme.fonts.body },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(7, 15, 20, 0.55)",
  },
  modalSheet: {
    maxHeight: "92%",
    backgroundColor: appTheme.colors.background,
    borderTopLeftRadius: appTheme.radius.lg,
    borderTopRightRadius: appTheme.radius.lg,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    paddingHorizontal: appTheme.spacing.md,
    paddingTop: appTheme.spacing.md,
    paddingBottom: appTheme.spacing.lg,
    gap: appTheme.spacing.sm,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 18,
    lineHeight: 22,
    fontFamily: appTheme.fonts.bodyMedium,
    color: appTheme.colors.text,
  },
  closeText: {
    color: appTheme.colors.primary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
  },
  modalContent: {
    gap: 10,
    paddingBottom: 16,
  },
});
