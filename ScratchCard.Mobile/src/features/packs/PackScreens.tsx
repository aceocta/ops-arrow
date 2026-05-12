import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import { ScreenContainer } from "../../components/ScreenContainer";
import { PrimaryButton } from "../../components/PrimaryButton";
import { StatusBadge } from "../../components/StatusBadge";
import { SellingOrder } from "../../types/enums";
import { Game } from "../../types/models";
import { MainStackParamList } from "../../types/navigation";
import { createGame, listGames, updateGame } from "../../api/gamesApi";
import { activatePack, completePack, createManualPack, getPack, listPacks, markIssuePack, pausePack, returnPack, updatePackDetails } from "../../api/packsApi";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";
import { subscribeScan } from "../barcode-scanner/scanBus";

type GameEditorState = {
  gameName: string;
  gameCode: string;
  ticketPrice: string;
  ticketsPerPack: string;
  startSerial: string;
  endSerial: string;
  sellingOrder: SellingOrder;
  isActive: boolean;
};

const defaultGameEditorState: GameEditorState = {
  gameName: "",
  gameCode: "",
  ticketPrice: "2",
  ticketsPerPack: "100",
  startSerial: "000",
  endSerial: "099",
  sellingOrder: SellingOrder.Ascending,
  isActive: true,
};

function normalizeGameCodeInput(value: string) {
  return value.replace(/[^0-9A-Za-z]/g, "").trim().toUpperCase();
}

function normalizeDashes(value: string) {
  return value.replace(/[\u2010\u2011\u2012\u2013\u2014\u2212\uFE58\uFE63\uFF0D]/g, "-");
}

function parseScannedPackCode(value: string) {
  const normalized = normalizeDashes(value).trim();
  if (!normalized) {
    return null;
  }

  const segments = normalized
    .split("-")
    .map((segment) => segment.replace(/[^0-9A-Za-z]/g, "").toUpperCase())
    .filter((segment) => segment.length > 0);

  if (segments.length >= 2) {
    return {
      gameCode: segments[0],
      packComponent: segments[segments.length - 1],
    };
  }

  const digits = normalized.replace(/\D/g, "");
  if (digits.length >= 11) {
    return {
      gameCode: digits.slice(0, 4),
      packComponent: digits.slice(4, 11),
    };
  }

  return null;
}

function mapGameToEditorState(game: Game): GameEditorState {
  return {
    gameName: game.gameName,
    gameCode: game.gameCode,
    ticketPrice: String(game.defaultTicketPrice),
    ticketsPerPack: String(game.defaultTicketsPerPack),
    startSerial: game.defaultStartSerialNumber,
    endSerial: game.defaultEndSerialNumber,
    sellingOrder: game.defaultSellingOrder,
    isActive: game.isActive,
  };
}

function toGamePayload(state: GameEditorState, shopId: string) {
  const normalizedGameCode = normalizeGameCodeInput(state.gameCode);
  return {
    shopId,
    gameName: state.gameName.trim(),
    gameCode: normalizedGameCode,
    defaultTicketPrice: Number(state.ticketPrice),
    defaultTicketsPerPack: Number(state.ticketsPerPack),
    defaultStartSerialNumber: state.startSerial.trim(),
    defaultEndSerialNumber: state.endSerial.trim(),
    defaultSellingOrder: state.sellingOrder,
    commissionRate: 0,
    isActive: state.isActive,
  };
}

function packStatusTone(status?: string): "neutral" | "warning" | "danger" | "success" {
  if (status === "Issue" || status === "Returned") return "danger";
  if (status === "Paused") return "warning";
  if (status === "Active" || status === "InStock" || status === "Completed") return "success";
  return "neutral";
}

function getSerialBoundsByOrder(totalTicketsRaw: string, order: SellingOrder) {
  const parsedTotal = Number(totalTicketsRaw);
  const safeTotal = Number.isFinite(parsedTotal) && parsedTotal > 0 ? Math.floor(parsedTotal) : 1;
  const maxSerial = safeTotal - 1;
  const width = Math.max(2, String(maxSerial).length);
  const minSerial = "0".padStart(width, "0");
  const maxSerialText = String(maxSerial).padStart(width, "0");

  if (order === SellingOrder.Descending) {
    return { start: maxSerialText, end: minSerial };
  }

  return { start: minSerial, end: maxSerialText };
}

function GameEditorFields({
  state,
  onChange,
  readOnlyMasterFields = false,
  showStatus = true,
}: {
  state: GameEditorState;
  onChange: (next: GameEditorState) => void;
  readOnlyMasterFields?: boolean;
  showStatus?: boolean;
}) {
  return (
    <>
      <Text style={styles.fieldLabel}>Game Name (Master)</Text>
      <TextInput
        style={[styles.input, readOnlyMasterFields && styles.inputReadOnly]}
        value={state.gameName}
        placeholder="Game name"
        placeholderTextColor={appTheme.colors.textSubtle}
        onChangeText={(value) => onChange({ ...state, gameName: value })}
        editable={!readOnlyMasterFields}
      />
      <Text style={styles.fieldLabel}>Game Code (Master)</Text>
      <TextInput
        style={[styles.input, readOnlyMasterFields && styles.inputReadOnly]}
        value={state.gameCode}
        placeholder="Game code"
        placeholderTextColor={appTheme.colors.textSubtle}
        onChangeText={(value) => onChange({ ...state, gameCode: value })}
        autoCapitalize="characters"
        editable={!readOnlyMasterFields}
      />
      {/* <Text style={styles.meta}>Only letters and numbers are used (2-20 chars).</Text> */}
      <Text style={styles.fieldLabel}>Ticket Price (Master)</Text>
      <TextInput
        style={[styles.input, readOnlyMasterFields && styles.inputReadOnly]}
        value={state.ticketPrice}
        placeholder="Ticket price"
        placeholderTextColor={appTheme.colors.textSubtle}
        keyboardType="decimal-pad"
        onChangeText={(value) => onChange({ ...state, ticketPrice: value })}
        editable={!readOnlyMasterFields}
      />
      <Text style={styles.fieldLabel}>Tickets Per Pack (Master)</Text>
      <TextInput
        style={[styles.input, readOnlyMasterFields && styles.inputReadOnly]}
        value={state.ticketsPerPack}
        placeholder="Tickets per pack"
        placeholderTextColor={appTheme.colors.textSubtle}
        keyboardType="number-pad"
        onChangeText={(value) => onChange({ ...state, ticketsPerPack: value })}
        editable={!readOnlyMasterFields}
      />
      <Text style={styles.fieldLabel}>Default Start Serial</Text>
      <TextInput
        style={styles.input}
        value={state.startSerial}
        placeholder="Default start serial"
        placeholderTextColor={appTheme.colors.textSubtle}
        onChangeText={(value) => onChange({ ...state, startSerial: value })}
      />
      <Text style={styles.fieldLabel}>Default End Serial</Text>
      <TextInput
        style={styles.input}
        value={state.endSerial}
        placeholder="Default end serial"
        placeholderTextColor={appTheme.colors.textSubtle}
        onChangeText={(value) => onChange({ ...state, endSerial: value })}
      />
      <Text style={styles.fieldLabel}>Selling Order</Text>
      <View style={styles.row}>
        <Pressable
          style={[styles.choice, state.sellingOrder === SellingOrder.Ascending && styles.choiceSelected]}
          onPress={() => onChange({ ...state, sellingOrder: SellingOrder.Ascending })}
        >
          <Text style={[styles.choiceText, state.sellingOrder === SellingOrder.Ascending && styles.choiceTextSelected]}>Ascending</Text>
        </Pressable>
        <Pressable
          style={[styles.choice, state.sellingOrder === SellingOrder.Descending && styles.choiceSelected]}
          onPress={() => onChange({ ...state, sellingOrder: SellingOrder.Descending })}
        >
          <Text style={[styles.choiceText, state.sellingOrder === SellingOrder.Descending && styles.choiceTextSelected]}>Descending</Text>
        </Pressable>
      </View>

      {showStatus ? (
        <>
          <Text style={styles.fieldLabel}>Status</Text>
          <View style={styles.row}>
            <Pressable
              style={[styles.choice, state.isActive && styles.choiceSelected]}
              onPress={() => onChange({ ...state, isActive: true })}
            >
              <Text style={[styles.choiceText, state.isActive && styles.choiceTextSelected]}>Active</Text>
            </Pressable>
            <Pressable
              style={[styles.choice, !state.isActive && styles.choiceSelected]}
              onPress={() => onChange({ ...state, isActive: false })}
            >
              <Text style={[styles.choiceText, !state.isActive && styles.choiceTextSelected]}>Inactive</Text>
            </Pressable>
          </View>
        </>
      ) : null}
    </>
  );
}

export function ScratchCardGamesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { activeShopId, activeShop, profile } = useAuth();
  const shopId = activeShopId;
  const isPlatformAdmin = (profile?.roles ?? []).some((role) => role === "PlatformAdmin");

  const gamesQuery = useQuery({
    queryKey: ["games", shopId],
    queryFn: () => listGames(shopId as string),
    enabled: Boolean(shopId),
  });

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.screenContent}>
        {/* <View style={styles.heroCard}>
          <Text style={styles.heroSubtitle}>Shop: {activeShop?.shopName ?? "-"}</Text>
          <Text style={styles.heroNote}>Manage master game assignments and defaults for this shop.</Text>
        </View> */}
          <PrimaryButton label="Create Game" onPress={() => navigation.navigate("ScratchCardGameCreate")} disabled={!shopId} />

        <View style={ui.card}>
          <Text style={styles.sectionTitle}>Assigned Games</Text>
          {!shopId ? <Text style={styles.meta}>Select a shop before managing games.</Text> : null}
          {shopId && gamesQuery.isLoading ? <Text style={styles.meta}>Loading games...</Text> : null}
          {shopId && !gamesQuery.isLoading && (gamesQuery.data ?? []).length === 0 ? (
            <Text style={styles.meta}>No games found.</Text>
          ) : null}
          {(gamesQuery.data ?? []).map((game) => (
            <View key={game.id} style={styles.item}>
              <View style={styles.rowBetween}>
                <Text style={styles.itemTitle}>{game.gameName} ({game.gameCode})</Text>
                {isPlatformAdmin ? (
                  <Pressable style={styles.smallButton} onPress={() => navigation.navigate("ScratchCardGameEdit", { gameId: game.id })}>
                    <Text style={styles.smallButtonText}>Edit</Text>
                  </Pressable>
                ) : null}
              </View>
              {isPlatformAdmin ? (
                <StatusBadge label={game.isActive ? "Active" : "Inactive"} tone={game.isActive ? "success" : "warning"} />
              ) : null}
              <View style={styles.metricRow}>
                <View style={styles.metricChip}><Text style={styles.metricText}>£ {Number(game.defaultTicketPrice).toFixed(2)}</Text></View>
                <View style={styles.metricChip}><Text style={styles.metricText}>{game.defaultTicketsPerPack} Tickets</Text></View>
                {/* <View style={styles.metricChip}><Text style={styles.metricText}>{game.defaultSellingOrder}</Text></View> */}
              </View>
              {/* <Text style={styles.meta}>Serial: {game.defaultStartSerialNumber} {"->"} {game.defaultEndSerialNumber}</Text> */}
            </View>
          ))}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

type GameCreateProps = NativeStackScreenProps<MainStackParamList, "ScratchCardGameCreate">;

export function ScratchCardGameCreateScreen({ navigation }: GameCreateProps) {
  const queryClient = useQueryClient();
  const { activeShopId, activeShop, profile } = useAuth();
  const shopId = activeShopId;
  const isPlatformAdmin = (profile?.roles ?? []).some((role) => role === "PlatformAdmin");
  const [state, setState] = useState<GameEditorState>(defaultGameEditorState);

  const createGameMutation = useMutation({
    mutationFn: async () => {
      if (!shopId) {
        throw new Error("No shop selected.");
      }
      const normalizedCode = normalizeGameCodeInput(state.gameCode);
      if (!state.gameName.trim() || !normalizedCode) {
        throw new Error("Game name and game code are required.");
      }
      if (normalizedCode.length < 2 || normalizedCode.length > 20) {
        throw new Error("Game code must be 2 to 20 letters/numbers.");
      }

      return createGame(toGamePayload(state, shopId));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["games", shopId] });
      Alert.alert("Created", "Scratch card game created.");
      navigation.goBack();
    },
    onError: (error: any) => {
      Alert.alert("Failed", error?.response?.data?.message ?? error?.message ?? "Unable to create game.");
    },
  });

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.screenContent}>
        {/* <View style={styles.heroCard}>
          <Text style={styles.heroSubtitle}>Shop: {activeShop?.shopName ?? "-"}</Text>
          <Text style={styles.heroNote}>Create a master game and assign shop defaults.</Text>
        </View> */}
        <View style={ui.card}>
          <GameEditorFields state={state} onChange={setState} showStatus={isPlatformAdmin} />
          <PrimaryButton
            label={createGameMutation.isPending ? "Saving..." : "Create Game"}
            onPress={() => createGameMutation.mutate()}
            disabled={createGameMutation.isPending || !shopId}
          />
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

type GameEditProps = NativeStackScreenProps<MainStackParamList, "ScratchCardGameEdit">;

export function ScratchCardGameEditScreen({ route, navigation }: GameEditProps) {
  const queryClient = useQueryClient();
  const { activeShopId, activeShop, profile } = useAuth();
  const shopId = activeShopId;
  const isPlatformAdmin = (profile?.roles ?? []).some((role) => role === "PlatformAdmin");
  const { gameId } = route.params;
  const [state, setState] = useState<GameEditorState>(defaultGameEditorState);
  const [isInitialized, setIsInitialized] = useState(false);

  const gamesQuery = useQuery({
    queryKey: ["games", shopId],
    queryFn: () => listGames(shopId as string),
    enabled: Boolean(shopId),
  });

  const game = (gamesQuery.data ?? []).find((item) => item.id === gameId);

  useEffect(() => {
    if (!game || isInitialized) {
      return;
    }

    setState(mapGameToEditorState(game));
    setIsInitialized(true);
  }, [game, isInitialized]);

  const updateGameMutation = useMutation({
    mutationFn: async () => {
      if (!shopId) {
        throw new Error("No shop selected.");
      }
      if (!game) {
        throw new Error("Game not found.");
      }
      const normalizedCode = normalizeGameCodeInput(state.gameCode);
      if (!state.gameName.trim() || !normalizedCode) {
        throw new Error("Game name and game code are required.");
      }
      if (normalizedCode.length < 2 || normalizedCode.length > 20) {
        throw new Error("Game code must be 2 to 20 letters/numbers.");
      }

      return updateGame(game.id, toGamePayload(state, shopId));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["games", shopId] });
      Alert.alert("Updated", "Scratch card game updated.");
      navigation.goBack();
    },
    onError: (error: any) => {
      Alert.alert("Failed", error?.response?.data?.message ?? error?.message ?? "Unable to update game.");
    },
  });

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.screenContent}>
        <View style={styles.heroCard}>
          <Text style={styles.heroSubtitle}>Shop: {activeShop?.shopName ?? "-"}</Text>
          <Text style={styles.heroNote}>Update shop defaults. Master fields can only be edited by PlatformAdmin.</Text>
        </View>
        <View style={ui.card}>
          {!shopId ? <Text style={styles.meta}>Select a shop before editing games.</Text> : null}
          {shopId && gamesQuery.isLoading ? <Text style={styles.meta}>Loading game...</Text> : null}
          {shopId && !gamesQuery.isLoading && !game ? <Text style={styles.meta}>Game not found.</Text> : null}

          {game ? (
            <>
              {!isPlatformAdmin ? <Text style={styles.meta}>Only PlatformAdmin can edit assigned games.</Text> : null}
              <GameEditorFields state={state} onChange={setState} readOnlyMasterFields={!isPlatformAdmin} showStatus={isPlatformAdmin} />
              {isPlatformAdmin ? (
                <PrimaryButton
                  label={updateGameMutation.isPending ? "Saving..." : "Save Changes"}
                  onPress={() => updateGameMutation.mutate()}
                  disabled={updateGameMutation.isPending || !shopId}
                />
              ) : null}
            </>
          ) : null}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

type PackListProps = NativeStackScreenProps<MainStackParamList, "ScratchCardPacks">;

export function ScratchCardPacksScreen({ navigation }: PackListProps) {
  const { activeShopId, activeShop } = useAuth();
  const shopId = activeShopId;

  const packsQuery = useQuery({
    queryKey: ["packs", shopId],
    queryFn: () => listPacks(shopId as string),
    enabled: Boolean(shopId),
  });

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.screenContent}>
        {/* <View style={styles.heroCard}>
          <Text style={styles.heroSubtitle}>Shop: {activeShop?.shopName ?? "-"}</Text>
          <Text style={styles.heroNote}>Track stock state, activation progress, and serial position.</Text>
        </View> */}
        <View style={styles.headerActionsRow}>
          <View style={styles.headerActionItem}>
            <PrimaryButton
              label="Add Manual Pack"
              onPress={() => navigation.navigate("ManualPackCreate")}
              disabled={!shopId}
            />
          </View>
          <View style={styles.headerActionItem}>
            <PrimaryButton
              label="Pack Scanner"
              tone="neutral"
              onPress={() => navigation.navigate("ManualPackCreate", { autoOpenScanner: true })}
              disabled={!shopId}
            />
          </View>
        </View>

        <View style={ui.card}>
          <Text style={styles.sectionTitle}>Pack Inventory</Text>
          {!shopId ? <Text style={styles.meta}>Select a shop to see packs.</Text> : null}
          {shopId && packsQuery.isLoading ? <Text style={styles.meta}>Loading packs...</Text> : null}
          {shopId && !packsQuery.isLoading && (packsQuery.data ?? []).length === 0 ? (
            <Text style={styles.meta}>No packs found for this shop.</Text>
          ) : null}
          {(packsQuery.data ?? []).map((pack) => (
            <View key={pack.id} style={styles.item}>
              <View style={styles.rowBetween}>
                <Text style={styles.itemTitle}>Pack {pack.packNumber} - {pack.gameName}</Text>
                <StatusBadge label={pack.status} tone={packStatusTone(pack.status)} />
              </View>
              <View style={styles.metricRow}>
                {pack.displayNumber != null ? (
                  <View style={styles.metricChip}><Text style={styles.metricText}>Display {pack.displayNumber}</Text></View>
                ) : null}
                <View style={styles.metricChip}><Text style={styles.metricText}>Current: {pack.currentSerialNumber}</Text></View>
                <View style={styles.metricChip}><Text style={styles.metricText}>£ {Number(pack.ticketPrice).toFixed(2)}</Text></View>
                <View style={styles.metricChip}><Text style={styles.metricText}>{pack.totalTickets} Tickets</Text></View>
                {pack.isManuallyAdded ? (
                  <View style={styles.metricChip}><Text style={styles.metricText}>Manual</Text></View>
                ) : null}
              </View>
              <View style={styles.rowWrap}>
                <Pressable style={styles.smallButton} onPress={() => navigation.navigate("PackDetails", { packId: pack.id })}>
                  <Text style={styles.smallButtonText}>Details</Text>
                </Pressable>
                {(pack.status === "InStock" || pack.status === "Paused") ? (
                  <Pressable style={styles.smallButton} onPress={() => navigation.navigate("ActivatePack", { packId: pack.id })}>
                    <Text style={styles.smallButtonText}>Activate</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

type ManualPackCreateProps = NativeStackScreenProps<MainStackParamList, "ManualPackCreate">;

type PendingManualPackDraft = {
  id: string;
  gameId: string;
  gameCode: string;
  gameName: string;
  packNumber: string;
  displayNumber?: number;
  ticketPrice: number;
  totalTickets: number;
  startSerialNumber: string;
  endSerialNumber: string;
  sellingOrder: SellingOrder;
  notes?: string;
};

export function ManualPackCreateScreen({ navigation, route }: ManualPackCreateProps) {
  const queryClient = useQueryClient();
  const { activeShopId, activeShop } = useAuth();
  const shopId = activeShopId;
  const [gameId, setGameId] = useState("");
  const [gameSearch, setGameSearch] = useState("");
  const [packNumber, setPackNumber] = useState("");
  const [displayNumber, setDisplayNumber] = useState("");
  const [ticketPrice, setTicketPrice] = useState("");
  const [totalTickets, setTotalTickets] = useState("");
  const [startSerialNumber, setStartSerialNumber] = useState("");
  const [endSerialNumber, setEndSerialNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [pendingPacks, setPendingPacks] = useState<PendingManualPackDraft[]>([]);
  const lastAutoSerialRangeRef = useRef<{ start: string; end: string } | null>(null);
  const awaitingPackScanRef = useRef(false);
  const hasAutoOpenedScannerRef = useRef(false);
  const activeGamesRef = useRef<Game[]>([]);

  const gamesQuery = useQuery({
    queryKey: ["games", shopId],
    queryFn: () => listGames(shopId as string),
    enabled: Boolean(shopId),
  });

  const activeGames = useMemo(() => (gamesQuery.data ?? []).filter((game) => game.isActive), [gamesQuery.data]);
  const selectedGame = activeGames.find((item) => item.id === gameId);
  const selectedGameLabel = selectedGame ? `${selectedGame.gameCode} - ${selectedGame.gameName}` : "";
  const filteredGames = useMemo(() => {
    const games = activeGames;
    const normalized = gameSearch.trim().toLowerCase();
    if (!normalized) {
      return games.slice(0, 8);
    }
    return games
      .filter((game) =>
        game.gameCode.toLowerCase().includes(normalized) || game.gameName.toLowerCase().includes(normalized)
      )
      .slice(0, 12);
  }, [activeGames, gameSearch]);
  const isSearchMatchingSelectedGame =
    Boolean(selectedGame) && gameSearch.trim().toLowerCase() === selectedGameLabel.toLowerCase();
  const showGameSuggestions =
    activeGames.length > 0 &&
    !isSearchMatchingSelectedGame &&
    (gameSearch.trim().length > 0 || !gameId);
  const ascendingSerialDefaults = useMemo(
    () => getSerialBoundsByOrder(totalTickets, SellingOrder.Ascending),
    [totalTickets]
  );

  function buildDraftFromForm(): PendingManualPackDraft {
    if (!gameId) {
      throw new Error("Select a game.");
    }
    if (!selectedGame) {
      throw new Error("Selected game is not available.");
    }

    const normalizedPackNumber = packNumber.trim().toUpperCase();
    if (!normalizedPackNumber) {
      throw new Error("Pack number is required.");
    }

    const parsedTicketPrice = Number(ticketPrice);
    if (!Number.isFinite(parsedTicketPrice) || parsedTicketPrice <= 0) {
      throw new Error("Ticket price must be greater than zero.");
    }

    const parsedTotalTickets = Number(totalTickets);
    if (!Number.isInteger(parsedTotalTickets) || parsedTotalTickets <= 0) {
      throw new Error("Total tickets must be a whole number greater than zero.");
    }

    const trimmedStartSerial = startSerialNumber.trim();
    const trimmedEndSerial = endSerialNumber.trim();
    if (!trimmedStartSerial || !trimmedEndSerial) {
      throw new Error("Start and end serial numbers are required.");
    }

    const trimmedDisplayNumber = displayNumber.trim();
    const parsedDisplayNumber = trimmedDisplayNumber.length > 0 ? Number(trimmedDisplayNumber) : undefined;
    if (trimmedDisplayNumber.length > 0 && (!Number.isInteger(parsedDisplayNumber) || (parsedDisplayNumber ?? 0) < 0)) {
      throw new Error("Display number must be a non-negative whole number.");
    }

    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      gameId,
      gameCode: selectedGame.gameCode,
      gameName: selectedGame.gameName,
      packNumber: normalizedPackNumber,
      displayNumber: parsedDisplayNumber,
      ticketPrice: parsedTicketPrice,
      totalTickets: parsedTotalTickets,
      startSerialNumber: trimmedStartSerial,
      endSerialNumber: trimmedEndSerial,
      sellingOrder: selectedGame.defaultSellingOrder,
      notes: notes.trim() || undefined,
    };
  }

  function resetForNextPackEntry() {
    setPackNumber("");
    setDisplayNumber("");
    setNotes("");
    setScanMessage("Pack added to temporary list. Add another pack or confirm batch create.");
  }

  function addCurrentPackToQueue() {
    try {
      const draft = buildDraftFromForm();
      const duplicate = pendingPacks.some(
        (item) =>
          item.gameId === draft.gameId &&
          item.packNumber.toUpperCase() === draft.packNumber.toUpperCase()
      );

      if (duplicate) {
        throw new Error(`Pack ${draft.packNumber} for ${draft.gameCode} is already in the temporary list.`);
      }

      setPendingPacks((previous) => [...previous, draft]);
      resetForNextPackEntry();
    } catch (error: any) {
      Alert.alert("Validation", error?.message ?? "Unable to add pack.");
    }
  }

  function openManualPackScanner() {
    awaitingPackScanRef.current = true;
    setScanMessage("Scan pack barcode and keep the label text in view.");
    const rootLikeNavigation = navigation.getParent()?.getParent() ?? navigation.getParent() ?? navigation;
    (rootLikeNavigation as any).navigate("BarcodeScanner", { mode: "single" });
  }

  useEffect(() => {
    activeGamesRef.current = activeGames;
  }, [activeGames]);

  useEffect(() => {
    if (!shopId) {
      return;
    }

    if (!route.params?.autoOpenScanner || hasAutoOpenedScannerRef.current) {
      return;
    }

    hasAutoOpenedScannerRef.current = true;
    openManualPackScanner();
  }, [route.params?.autoOpenScanner, shopId]);

  useEffect(() => {
    const unsubscribe = subscribeScan((payload) => {
      if (!awaitingPackScanRef.current) {
        return;
      }

      awaitingPackScanRef.current = false;

      const parsed =
        parseScannedPackCode(payload.rawBarcode) ??
        parseScannedPackCode(payload.parsedPackNumber ?? "");
      if (!parsed) {
        setScanMessage("Could not parse pack number from scan. Try again.");
        return;
      }

      const scannedGameCode = parsed.gameCode;
      const scannedPackComponent = parsed.packComponent;

      setPackNumber(scannedPackComponent);

      const matchingGame = activeGamesRef.current.find(
        (game) => game.gameCode.toUpperCase() === scannedGameCode
      );

      if (matchingGame) {
        setGameId(matchingGame.id);
        setGameSearch(`${matchingGame.gameCode} - ${matchingGame.gameName}`);
        setScanMessage(`Scanned game ${scannedGameCode}, pack ${scannedPackComponent}.`);
        return;
      }

      setScanMessage(
        `Scanned game ${scannedGameCode}, pack ${scannedPackComponent}. Select matching game for this shop.`
      );
    });

    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    if (!selectedGame) {
      return;
    }

    setTicketPrice(String(selectedGame.defaultTicketPrice));
    setTotalTickets(String(selectedGame.defaultTicketsPerPack));
  }, [selectedGame?.id]);

  useEffect(() => {
    const previousAuto = lastAutoSerialRangeRef.current;
    const shouldApplyStart =
      !startSerialNumber.trim() || (previousAuto ? startSerialNumber === previousAuto.start : false);
    const shouldApplyEnd =
      !endSerialNumber.trim() || (previousAuto ? endSerialNumber === previousAuto.end : false);

    if (shouldApplyStart && startSerialNumber !== ascendingSerialDefaults.start) {
      setStartSerialNumber(ascendingSerialDefaults.start);
    }
    if (shouldApplyEnd && endSerialNumber !== ascendingSerialDefaults.end) {
      setEndSerialNumber(ascendingSerialDefaults.end);
    }

    lastAutoSerialRangeRef.current = ascendingSerialDefaults;
  }, [ascendingSerialDefaults, startSerialNumber, endSerialNumber]);

  const createAndActivateBatchMutation = useMutation({
    mutationFn: async () => {
      if (!shopId) {
        throw new Error("No shop selected.");
      }

      if (pendingPacks.length === 0) {
        throw new Error("Temporary list is empty. Add at least one pack first.");
      }

      const created = [];
      for (const draft of pendingPacks) {
        const createdPack = await createManualPack({
          shopId,
          gameId: draft.gameId,
          packNumber: draft.packNumber,
          displayNumber: draft.displayNumber,
          ticketPrice: draft.ticketPrice,
          totalTickets: draft.totalTickets,
          startSerialNumber: draft.startSerialNumber,
          endSerialNumber: draft.endSerialNumber,
          sellingOrder: draft.sellingOrder,
          notes: draft.notes,
        });

        if (createdPack.status !== "Active") {
          await activatePack(createdPack.id, {
            openingSerialNumber: createdPack.currentSerialNumber || draft.startSerialNumber,
            sellingOrder: draft.sellingOrder,
          });
        }

        created.push(createdPack);
      }

      return created;
    },
    onSuccess: (createdPacks) => {
      void queryClient.invalidateQueries({ queryKey: ["packs", shopId] });
      setPendingPacks([]);
      setScanMessage(null);
      Alert.alert("Created", `${createdPacks.length} pack(s) created and activated.`);
      navigation.goBack();
    },
    onError: (error: any) => {
      Alert.alert("Failed", error?.response?.data?.message ?? error?.message ?? "Unable to create manual packs.");
    },
  });

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.screenContent}>
        {/* <View style={styles.heroCard}>
          <Text style={styles.heroSubtitle}>Shop: {activeShop?.shopName ?? "-"}</Text>
          <Text style={styles.heroNote}>Manual packs are created as Active by default.</Text>
        </View> */}

        <View style={ui.card}>
          <Text style={styles.fieldLabel}>Game</Text>
          <TextInput
            style={styles.input}
            value={gameSearch}
            onChangeText={(value) => {
              setGameSearch(value);
              if (selectedGame && value !== selectedGameLabel) {
                setGameId("");
              }
            }}
            placeholder="Search game by code or name"
            placeholderTextColor={appTheme.colors.textSubtle}
          />
          {showGameSuggestions ? (
            <View style={styles.autocompleteList}>
              {filteredGames.map((game) => (
                <Pressable
                  key={game.id}
                  style={styles.autocompleteItem}
                  onPress={() => {
                    setGameId(game.id);
                    setGameSearch(`${game.gameCode} - ${game.gameName}`);
                  }}
                >
                  <Text style={styles.autocompleteItemText}>{game.gameCode} - {game.gameName}</Text>
                </Pressable>
              ))}
              {filteredGames.length === 0 ? <Text style={styles.meta}>No matching games.</Text> : null}
            </View>
          ) : null}
          {!selectedGame ? <Text style={styles.meta}>Choose a game to auto-fill defaults.</Text> : null}

          <Text style={styles.fieldLabel}>Pack Number</Text>
          <View style={styles.scanInputRow}>
            <TextInput
              style={[styles.input, styles.inlinePackInput]}
              value={packNumber}
              onChangeText={setPackNumber}
              placeholder="Pack number (ex: 0009477)"
              placeholderTextColor={appTheme.colors.textSubtle}
              autoCapitalize="characters"
            />
            <Pressable
              style={[styles.inlineScanButton, !shopId && styles.inlineScanButtonDisabled]}
              onPress={openManualPackScanner}
              disabled={!shopId}
              accessibilityRole="button"
              accessibilityLabel="Scan pack number"
            >
              <View style={styles.scanIconWrap}>
                <View style={[styles.scanCorner, styles.scanCornerTopLeft]} />
                <View style={[styles.scanCorner, styles.scanCornerTopRight]} />
                <View style={[styles.scanCorner, styles.scanCornerBottomLeft]} />
                <View style={[styles.scanCorner, styles.scanCornerBottomRight]} />
                <View style={styles.inlineScanGlyph}>
                  <View style={[styles.barcodeBar, styles.barcodeBarThin]} />
                  <View style={[styles.barcodeBar, styles.barcodeBarWide]} />
                  <View style={[styles.barcodeBar, styles.barcodeBarThin]} />
                  <View style={[styles.barcodeBar, styles.barcodeBarMedium]} />
                  <View style={[styles.barcodeBar, styles.barcodeBarThin]} />
                  <View style={[styles.barcodeBar, styles.barcodeBarWide]} />
                  <View style={[styles.barcodeBar, styles.barcodeBarThin]} />
                </View>
              </View>
            </Pressable>
          </View>
          {/* <Text style={styles.meta}>From scan: red = game code, green = pack number.</Text> */}
          {scanMessage ? <Text style={styles.meta}>{scanMessage}</Text> : null}

          <Text style={styles.fieldLabel}>Display Number (Optional)</Text>
          <TextInput
            style={styles.input}
            value={displayNumber}
            onChangeText={setDisplayNumber}
            keyboardType="number-pad"
            placeholder="Display number"
            placeholderTextColor={appTheme.colors.textSubtle}
          />

          <Text style={styles.fieldLabel}>Ticket Price</Text>
          <TextInput
            style={styles.input}
            value={ticketPrice}
            onChangeText={setTicketPrice}
            keyboardType="decimal-pad"
            placeholder="Ticket price"
            placeholderTextColor={appTheme.colors.textSubtle}
          />

          <Text style={styles.fieldLabel}>Total Tickets</Text>
          <TextInput
            style={styles.input}
            value={totalTickets}
            onChangeText={setTotalTickets}
            keyboardType="number-pad"
            placeholder="Total tickets"
            placeholderTextColor={appTheme.colors.textSubtle}
          />

          <Text style={styles.fieldLabel}>Start Serial Number</Text>
          <TextInput
            style={styles.input}
            value={startSerialNumber}
            onChangeText={setStartSerialNumber}
            placeholder="Start serial number"
            placeholderTextColor={appTheme.colors.textSubtle}
          />

          <Text style={styles.fieldLabel}>End Serial Number</Text>
          <TextInput
            style={styles.input}
            value={endSerialNumber}
            onChangeText={setEndSerialNumber}
            placeholder="End serial number"
            placeholderTextColor={appTheme.colors.textSubtle}
          />
          <Text style={styles.meta}>
            Default range (ascending): {ascendingSerialDefaults.start} {"->"} {ascendingSerialDefaults.end}
          </Text>

          <Text style={styles.fieldLabel}>Notes (Optional)</Text>
          <TextInput
            style={styles.input}
            value={notes}
            onChangeText={setNotes}
            placeholder="Notes"
            placeholderTextColor={appTheme.colors.textSubtle}
          />

          <PrimaryButton
            label="Add To Temporary List"
            onPress={addCurrentPackToQueue}
            disabled={createAndActivateBatchMutation.isPending || !shopId}
          />

          <View style={styles.summaryQueueCard}>
            <View style={styles.rowBetween}>
              <Text style={styles.sectionTitle}>Temporary Pack List</Text>
              <Text style={styles.meta}>{pendingPacks.length} item(s)</Text>
            </View>
            {pendingPacks.length === 0 ? (
              <Text style={styles.meta}>No packs queued yet.</Text>
            ) : (
              pendingPacks.map((item, index) => (
                <View key={item.id} style={styles.item}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.itemTitle}>
                      {index + 1}. {item.gameCode} - {item.packNumber}
                    </Text>
                    <Pressable
                      style={styles.smallButton}
                      onPress={() => setPendingPacks((previous) => previous.filter((candidate) => candidate.id !== item.id))}
                      disabled={createAndActivateBatchMutation.isPending}
                    >
                      <Text style={styles.smallButtonText}>Remove</Text>
                    </Pressable>
                  </View>
                  <Text style={styles.meta}>
                    {item.gameName} | £ {item.ticketPrice.toFixed(2)} | {item.totalTickets} tickets
                  </Text>
                  <Text style={styles.meta}>
                    {item.startSerialNumber} {"->"} {item.endSerialNumber}
                    {item.displayNumber != null ? ` | Display ${item.displayNumber}` : ""}
                  </Text>
                </View>
              ))
            )}
          </View>

          <PrimaryButton
            label={createAndActivateBatchMutation.isPending ? "Creating..." : `Confirm Create & Activate (${pendingPacks.length})`}
            onPress={() => createAndActivateBatchMutation.mutate()}
            disabled={createAndActivateBatchMutation.isPending || pendingPacks.length === 0 || !shopId}
          />
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

type PackDetailsProps = NativeStackScreenProps<MainStackParamList, "PackDetails">;

export function PackDetailsScreen({ route }: PackDetailsProps) {
  const queryClient = useQueryClient();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { packId } = route.params;
  const packQuery = useQuery({
    queryKey: ["pack", packId],
    queryFn: () => getPack(packId),
  });
  const [notes, setNotes] = useState("");
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [editPackNumber, setEditPackNumber] = useState("");
  const [editDisplayNumber, setEditDisplayNumber] = useState("");
  const [editTicketPrice, setEditTicketPrice] = useState("");
  const [editTotalTickets, setEditTotalTickets] = useState("");
  const [editStartSerial, setEditStartSerial] = useState("");
  const [editEndSerial, setEditEndSerial] = useState("");

  const actionMutation = useMutation({
    mutationFn: async (action: "pause" | "return" | "issue" | "complete") => {
      if (action === "pause") return pausePack(packId, notes);
      if (action === "return") return returnPack(packId, notes);
      if (action === "issue") return markIssuePack(packId, notes);
      return completePack(packId, notes);
    },
    onSuccess: () => {
      setNotes("");
      void queryClient.invalidateQueries({ queryKey: ["pack", packId] });
      void queryClient.invalidateQueries({ queryKey: ["packs"] });
      Alert.alert("Updated", "Pack status updated.");
    },
    onError: (error: any) => {
      Alert.alert("Failed", error?.response?.data?.message ?? "Unable to update pack.");
    },
  });

  const pack = packQuery.data;
  const canActivate = pack?.status === "InStock" || pack?.status === "Paused";
  const canEditDetails = canActivate;

  useEffect(() => {
    if (!pack || isEditingDetails) {
      return;
    }

    setEditPackNumber(pack.packNumber);
    setEditDisplayNumber(pack.displayNumber != null ? String(pack.displayNumber) : "");
    setEditTicketPrice(String(pack.ticketPrice));
    setEditTotalTickets(String(pack.totalTickets));
    setEditStartSerial(pack.startSerialNumber);
    setEditEndSerial(pack.endSerialNumber);
  }, [pack, isEditingDetails]);

  const updateDetailsMutation = useMutation({
    mutationFn: async () => {
      if (!pack) {
        throw new Error("Pack not loaded.");
      }
      if (!editPackNumber.trim()) {
        throw new Error("Pack number is required.");
      }
      const trimmedDisplayNumber = editDisplayNumber.trim();
      const parsedDisplayNumber = trimmedDisplayNumber.length > 0 ? Number(trimmedDisplayNumber) : undefined;
      if (trimmedDisplayNumber.length > 0 && (!Number.isInteger(parsedDisplayNumber) || (parsedDisplayNumber ?? 0) < 0)) {
        throw new Error("Display number must be a whole number 0 or greater.");
      }
      return updatePackDetails(pack.id, {
        packNumber: editPackNumber.trim().toUpperCase(),
        displayNumber: parsedDisplayNumber,
        ticketPrice: Number(editTicketPrice),
        totalTickets: Number(editTotalTickets),
        startSerialNumber: editStartSerial.trim(),
        endSerialNumber: editEndSerial.trim(),
      });
    },
    onSuccess: () => {
      setIsEditingDetails(false);
      void queryClient.invalidateQueries({ queryKey: ["pack", packId] });
      void queryClient.invalidateQueries({ queryKey: ["packs"] });
      Alert.alert("Updated", "Pack details updated.");
    },
    onError: (error: any) => {
      Alert.alert("Failed", error?.response?.data?.message ?? error?.message ?? "Unable to update pack details.");
    },
  });

  function cancelEditDetails() {
    if (!pack) {
      setIsEditingDetails(false);
      return;
    }
    setEditPackNumber(pack.packNumber);
    setEditDisplayNumber(pack.displayNumber != null ? String(pack.displayNumber) : "");
    setEditTicketPrice(String(pack.ticketPrice));
    setEditTotalTickets(String(pack.totalTickets));
    setEditStartSerial(pack.startSerialNumber);
    setEditEndSerial(pack.endSerialNumber);
    setIsEditingDetails(false);
  }

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.screenContent}>
        <View style={styles.heroCard}>
          <Text style={styles.heroSubtitle}>Pack: {pack?.packNumber ?? "-"}</Text>
          <Text style={styles.heroSubtitle}>Game: {pack?.gameName ?? "-"}</Text>
          <StatusBadge label={pack?.status ?? "-"} tone={packStatusTone(pack?.status)} />
        </View>

        <View style={ui.card}>
          <View style={styles.metricRow}>
            <View style={styles.metricChip}>
              <Text style={styles.metricText}>
                Display: {isEditingDetails ? (editDisplayNumber.trim() || "-") : (pack?.displayNumber != null ? String(pack.displayNumber) : "-")}
              </Text>
            </View>
            <View style={styles.metricChip}>
              <Text style={styles.metricText}>Selling: {pack?.sellingOrder ?? "-"}</Text>
            </View>
            <View style={styles.metricChip}>
              <Text style={styles.metricText}>Current: {pack?.currentSerialNumber ?? "-"}</Text>
            </View>
            <View style={styles.metricChip}>
              <Text style={styles.metricText}>£ {isEditingDetails ? Number(editTicketPrice || 0).toFixed(2) : Number(pack?.ticketPrice ?? 0).toFixed(2)}</Text>
            </View>
          </View>
          <Text style={styles.meta}>Serial: {isEditingDetails ? editStartSerial : (pack?.startSerialNumber ?? "-")} {"->"} {isEditingDetails ? editEndSerial : (pack?.endSerialNumber ?? "-")}</Text>

          {isEditingDetails ? (
            <>
              <Text style={styles.fieldLabel}>Pack Number</Text>
              <TextInput style={styles.input} value={editPackNumber} onChangeText={setEditPackNumber} placeholder="Pack number" placeholderTextColor={appTheme.colors.textSubtle} />
              <Text style={styles.fieldLabel}>Display Number (Optional)</Text>
              <TextInput
                style={styles.input}
                value={editDisplayNumber}
                onChangeText={setEditDisplayNumber}
                keyboardType="number-pad"
                placeholder="Display number"
                placeholderTextColor={appTheme.colors.textSubtle}
              />
              <Text style={styles.fieldLabel}>Ticket Price</Text>
              <TextInput style={styles.input} value={editTicketPrice} onChangeText={setEditTicketPrice} keyboardType="decimal-pad" placeholder="Ticket price" placeholderTextColor={appTheme.colors.textSubtle} />
              <Text style={styles.fieldLabel}>Total Tickets</Text>
              <TextInput style={styles.input} value={editTotalTickets} onChangeText={setEditTotalTickets} keyboardType="number-pad" placeholder="Total tickets" placeholderTextColor={appTheme.colors.textSubtle} />
              <Text style={styles.fieldLabel}>Start Serial</Text>
              <TextInput style={styles.input} value={editStartSerial} onChangeText={setEditStartSerial} placeholder="Start serial" placeholderTextColor={appTheme.colors.textSubtle} />
              <Text style={styles.fieldLabel}>End Serial</Text>
              <TextInput style={styles.input} value={editEndSerial} onChangeText={setEditEndSerial} placeholder="End serial" placeholderTextColor={appTheme.colors.textSubtle} />
              <PrimaryButton
                label={updateDetailsMutation.isPending ? "Saving..." : "Save Pack Details"}
                onPress={() => updateDetailsMutation.mutate()}
                disabled={updateDetailsMutation.isPending}
              />
              <PrimaryButton label="Cancel Edit" tone="neutral" onPress={cancelEditDetails} />
            </>
          ) : null}

          {!isEditingDetails && canEditDetails ? (
            <PrimaryButton label="Edit Pack Details" tone="neutral" onPress={() => setIsEditingDetails(true)} />
          ) : null}
          {!isEditingDetails && !canEditDetails ? (
            <Text style={styles.meta}>Details can be edited only while pack status is InStock or Paused.</Text>
          ) : null}

          {!isEditingDetails ? (
            <>
              {canActivate ? (
                <PrimaryButton label="Go To Activate" onPress={() => navigation.navigate("ActivatePack", { packId })} />
              ) : (
                <Text style={styles.meta}>Activation requires status InStock or Paused.</Text>
              )}
              <Text style={styles.fieldLabel}>Status Change Notes</Text>
              <TextInput style={styles.input} value={notes} onChangeText={setNotes} placeholder="Notes for status change" placeholderTextColor={appTheme.colors.textSubtle} />

              <View style={styles.rowWrap}>
                <Pressable style={styles.smallButton} onPress={() => actionMutation.mutate("pause")}><Text style={styles.smallButtonText}>Pause</Text></Pressable>
                <Pressable style={styles.smallButton} onPress={() => actionMutation.mutate("return")}><Text style={styles.smallButtonText}>Return</Text></Pressable>
                <Pressable style={styles.smallButton} onPress={() => actionMutation.mutate("issue")}><Text style={styles.smallButtonText}>Mark Issue</Text></Pressable>
                <Pressable style={styles.smallButton} onPress={() => actionMutation.mutate("complete")}><Text style={styles.smallButtonText}>Complete</Text></Pressable>
              </View>
            </>
          ) : (
            <Text style={styles.meta}>Status actions are hidden while editing pack details.</Text>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

type ActivatePackProps = NativeStackScreenProps<MainStackParamList, "ActivatePack">;

export function ActivatePackScreen({ route, navigation }: ActivatePackProps) {
  const queryClient = useQueryClient();
  const { packId } = route.params;
  const packQuery = useQuery({
    queryKey: ["pack", packId],
    queryFn: () => getPack(packId),
  });

  const pack = packQuery.data;
  const [openingSerialNumber, setOpeningSerialNumber] = useState("");

  useEffect(() => {
    if (!openingSerialNumber && pack?.currentSerialNumber) {
      setOpeningSerialNumber(pack.currentSerialNumber);
    }
  }, [pack, openingSerialNumber]);

  const activateMutation = useMutation({
    mutationFn: async () => activatePack(packId, { openingSerialNumber: openingSerialNumber.trim() }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["pack", packId] });
      void queryClient.invalidateQueries({ queryKey: ["packs"] });
      Alert.alert("Activated", "Pack activated successfully.");
      navigation.goBack();
    },
    onError: (error: any) => {
      Alert.alert("Failed", error?.response?.data?.message ?? "Unable to activate pack.");
    },
  });

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.screenContent}>
        <View style={styles.heroCard}>
          <Text style={styles.heroSubtitle}>Pack: {pack?.packNumber ?? "-"}</Text>
          <Text style={styles.heroSubtitle}>Game: {pack?.gameName ?? "-"}</Text>
          <Text style={styles.heroNote}>Allowed serial range: {pack?.startSerialNumber ?? "-"} {"->"} {pack?.endSerialNumber ?? "-"}</Text>
        </View>
        <View style={ui.card}>
          <Text style={styles.fieldLabel}>Opening Serial Number</Text>
          <TextInput
            style={styles.input}
            value={openingSerialNumber}
            onChangeText={setOpeningSerialNumber}
            placeholder="Opening serial number"
            placeholderTextColor={appTheme.colors.textSubtle}
          />

          <PrimaryButton
            label={activateMutation.isPending ? "Activating..." : "Activate"}
            onPress={() => activateMutation.mutate()}
            disabled={activateMutation.isPending}
          />
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screenContent: { gap: appTheme.spacing.sm },
  headerActionsRow: {
    flexDirection: "row",
    gap: appTheme.spacing.xs,
  },
  headerActionItem: {
    flex: 1,
  },
  heroCard: {
    backgroundColor: appTheme.colors.primary,
    borderRadius: appTheme.radius.lg,
    borderWidth: 1,
    borderColor: appTheme.colors.primaryPressed,
    padding: appTheme.spacing.lg,
    gap: appTheme.spacing.xs,
  },
  heroSubtitle: {
    color: appTheme.colors.onPrimary,
    fontSize: 14,
    lineHeight: 19,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  heroNote: {
    color: "#DCEAF4",
    fontSize: 13,
    lineHeight: 18,
    fontFamily: appTheme.fonts.body,
  },
  sectionTitle: {
    color: appTheme.colors.text,
    fontSize: 17,
    lineHeight: 22,
    fontFamily: appTheme.fonts.bodyMedium,
  },
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
    lineHeight: 18,
    fontFamily: appTheme.fonts.body,
  },
  scanInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.xs,
  },
  inlinePackInput: {
    flex: 1,
  },
  inlineScanButton: {
    width: 44,
    height: 44,
    borderWidth: 1,
    borderColor: appTheme.colors.borderStrong,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  inlineScanButtonDisabled: {
    opacity: 0.45,
  },
  scanIconWrap: {
    width: 22,
    height: 22,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  scanCorner: {
    position: "absolute",
    width: 6,
    height: 6,
    borderColor: appTheme.colors.textSubtle,
  },
  scanCornerTopLeft: {
    top: 1,
    left: 1,
    borderTopWidth: 1.5,
    borderLeftWidth: 1.5,
  },
  scanCornerTopRight: {
    top: 1,
    right: 1,
    borderTopWidth: 1.5,
    borderRightWidth: 1.5,
  },
  scanCornerBottomLeft: {
    bottom: 1,
    left: 1,
    borderBottomWidth: 1.5,
    borderLeftWidth: 1.5,
  },
  scanCornerBottomRight: {
    bottom: 1,
    right: 1,
    borderBottomWidth: 1.5,
    borderRightWidth: 1.5,
  },
  inlineScanGlyph: {
    flexDirection: "row",
    alignItems: "flex-end",
    height: 14,
    gap: 1.5,
  },
  barcodeBar: {
    backgroundColor: appTheme.colors.text,
    borderRadius: 0.5,
  },
  barcodeBarThin: {
    width: 1.75,
    height: 9,
  },
  barcodeBarMedium: {
    width: 2.5,
    height: 12,
  },
  barcodeBarWide: {
    width: 3,
    height: 14,
  },
  inputReadOnly: {
    opacity: 0.65,
  },
  row: { flexDirection: "row", gap: appTheme.spacing.xs },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: appTheme.spacing.xs,
  },
  rowWrap: { flexDirection: "row", flexWrap: "wrap", gap: appTheme.spacing.xs },
  choice: {
    borderWidth: 1,
    borderColor: appTheme.colors.borderStrong,
    borderRadius: appTheme.radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  choiceSelected: {
    backgroundColor: appTheme.colors.primary,
    borderColor: appTheme.colors.primary,
  },
  choiceText: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 16,
  },
  choiceTextSelected: { color: appTheme.colors.onPrimary },
  item: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    padding: appTheme.spacing.sm,
    gap: appTheme.spacing.xs,
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  itemTitle: {
    fontFamily: appTheme.fonts.bodyMedium,
    color: appTheme.colors.text,
    fontSize: 14,
    lineHeight: 18,
    flexShrink: 1,
  },
  meta: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 13,
    lineHeight: 18,
  },
  metricRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: appTheme.spacing.xs,
  },
  metricChip: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.surface,
    borderRadius: appTheme.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  metricText: {
    color: appTheme.colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: appTheme.fonts.bodyMedium,
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
  summaryQueueCard: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    padding: appTheme.spacing.sm,
    gap: appTheme.spacing.xs,
  },
  smallButton: {
    backgroundColor: appTheme.colors.primary,
    borderRadius: appTheme.radius.sm,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: appTheme.colors.primaryPressed,
  },
  smallButtonText: {
    color: appTheme.colors.onPrimary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 14,
  },
});
