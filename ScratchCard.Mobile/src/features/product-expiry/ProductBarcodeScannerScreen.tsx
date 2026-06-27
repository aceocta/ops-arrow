import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { BarcodeType, CameraView, useCameraPermissions } from "expo-camera";
import Constants from "expo-constants";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { haptics } from "../../utils/haptics";
import { MainStackParamList } from "../../types/navigation";
import { appTheme } from "../../ui/theme";
import { emitProductScan } from "./productScanBus";
import { parseExpiryDate } from "./expiryDateOcr";
import { extractNameCandidates } from "./productNameOcr";

// Retail product barcodes (EAN/UPC) plus 2D codes that can carry batch/expiry.
const PRODUCT_BARCODE_TYPES: BarcodeType[] = ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "qr", "datamatrix"];

type ScannerRoute = RouteProp<MainStackParamList, "ProductBarcodeScanner">;

// On-device ML Kit text recognition (same module the scratch-card scanner uses). Requires a dev/native
// build — throws a helpful message under Expo Go.
// True when on-device text OCR can't run (Expo Go / store client lacks the native ML Kit module).
// Used both to message clearly and to hide the "Read" action up front so the user is never sent to
// frame a label that can't be read.
const OCR_UNAVAILABLE = Constants.appOwnership === "expo" || Constants.executionEnvironment === "storeClient";

async function recognizeTextWithMlkit(imageUri: string): Promise<{ text: string }> {
  if (OCR_UNAVAILABLE) {
    throw new Error("Label scanning needs the full app build, not Expo Go — type the name/date instead.");
  }
  const mod = (await import("@infinitered/react-native-mlkit-text-recognition")) as any;
  const recognizeTextFn =
    mod?.recognizeText ?? mod?.default?.recognizeText ?? (typeof mod?.default === "function" ? mod.default : undefined);
  if (typeof recognizeTextFn !== "function") throw new Error("ML Kit text recognition is not available in this build.");
  return await recognizeTextFn(imageUri);
}

export function ProductBarcodeScannerScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute<ScannerRoute>();
  const mode = route.params?.mode ?? "barcode";
  const isDateMode = mode === "date";
  const isNameMode = mode === "name";
  const isOcrMode = isDateMode || isNameMode; // OCR modes disable live barcode scanning
  const ocrUnavailable = isOcrMode && OCR_UNAVAILABLE; // can't run text OCR in this build

  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);
  const handledRef = useRef(false);
  const mountedRef = useRef(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  // Name-OCR: after a capture we show the recognised candidate lines for the user to pick from
  // (auto-picking a wrong name off a busy label is worse than asking). detectedDate is the bonus
  // expiry read from the same shot, if any.
  const [candidates, setCandidates] = useState<string[]>([]);
  const [detectedDate, setDetectedDate] = useState<string | undefined>(undefined);
  const [picking, setPicking] = useState(false);
  // A product name often wraps across two label lines ("Cadbury Dairy Milk" / "Fruit & Nut"), so the
  // picker is multi-select: the user taps every line that belongs to the name and we join them, in
  // tap order, into one product name. Empty until they tap a line.
  const [selectedNames, setSelectedNames] = useState<string[]>([]);

  useEffect(() => () => { mountedRef.current = false; }, []);

  // Cancel must mark the scan handled so an in-flight async date capture can't also act (a second
  // goBack would pop the screen underneath, and emitProductScan would write into a screen we left).
  const cancel = useCallback(() => {
    handledRef.current = true;
    setPicking(false); // stop an in-flight OCR result repainting the picker as we leave
    navigation.goBack();
  }, [navigation]);

  const onBarcodeScanned = useCallback(
    ({ data, type }: { data: string; type?: string }) => {
      if (handledRef.current) return;
      const raw = (data ?? "").trim();
      if (!raw) return;
      handledRef.current = true;
      haptics.success();
      emitProductScan({ raw, type });
      navigation.goBack();
    },
    [navigation],
  );

  const captureDate = useCallback(async () => {
    if (busy || handledRef.current || !cameraRef.current || !ready) return;
    setBusy(true);
    setMessage(null);
    try {
      const shot = await cameraRef.current.takePictureAsync({ quality: 0.6, skipProcessing: true, shutterSound: false });
      if (!shot?.uri) {
        if (mountedRef.current) setMessage("Capture failed — try again.");
        return;
      }
      const { text } = await recognizeTextWithMlkit(shot.uri);
      // OCR took ~1-3s — bail if the user cancelled / left while it ran.
      if (handledRef.current || !mountedRef.current) return;
      const date = parseExpiryDate(text ?? "");
      if (!date) {
        if (mountedRef.current) setMessage("Couldn't read a date — hold steady over the printed date, or type it.");
        return;
      }
      handledRef.current = true;
      haptics.success();
      emitProductScan({ expiry: date });
      navigation.goBack();
    } catch (e: any) {
      if (mountedRef.current) setMessage(String(e?.message ?? "OCR failed."));
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [busy, ready, navigation]);

  // Name mode: OCR the label, surface candidate name lines for the user to pick, and grab the
  // printed expiry in the same shot when it's there (one capture can fill both name + date).
  const captureName = useCallback(async () => {
    if (busy || handledRef.current || !cameraRef.current || !ready) return;
    setBusy(true);
    setMessage(null);
    try {
      const shot = await cameraRef.current.takePictureAsync({ quality: 0.6, skipProcessing: true, shutterSound: false });
      if (!shot?.uri) {
        if (mountedRef.current) setMessage("Capture failed — try again.");
        return;
      }
      const { text } = await recognizeTextWithMlkit(shot.uri);
      if (handledRef.current || !mountedRef.current) return;
      const names = extractNameCandidates(text ?? "");
      if (!names.length) {
        if (mountedRef.current) setMessage("Couldn't read a name — fill the frame with the product name, or type it.");
        return;
      }
      const date = parseExpiryDate(text ?? "");
      // Guard on handledRef too (not just mounted): if the user tapped Cancel during the ~1-3s OCR,
      // the screen may still be mounted but is tearing down — don't flash the picker.
      if (!handledRef.current && mountedRef.current) {
        setCandidates(names);
        setDetectedDate(date);
        setPicking(true);
      }
    } catch (e: any) {
      if (mountedRef.current) setMessage(String(e?.message ?? "OCR failed."));
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [busy, ready]);

  // Toggle a candidate line in/out of the selection, preserving tap order (so the combined name
  // reads in the order the user picked the lines).
  const toggleName = useCallback((name: string) => {
    setSelectedNames((cur) => (cur.includes(name) ? cur.filter((n) => n !== name) : [...cur, name]));
  }, []);

  const combinedName = selectedNames.join(" ").replace(/\s+/g, " ").trim();

  const confirmName = useCallback(() => {
    if (handledRef.current) return;
    // Clamp so two long lines can't exceed the product-name column (server caps at 200).
    const name = selectedNames.join(" ").replace(/\s+/g, " ").trim().slice(0, 120);
    if (!name) return;
    handledRef.current = true;
    haptics.success();
    emitProductScan({ name, expiry: detectedDate });
    navigation.goBack();
  }, [selectedNames, detectedDate, navigation]);

  const retake = useCallback(() => {
    setPicking(false);
    setCandidates([]);
    setSelectedNames([]);
    setDetectedDate(undefined);
    setMessage(null);
  }, []);

  if (!permission) {
    return <View style={styles.center}><Text style={styles.text}>Checking camera permission…</Text></View>;
  }
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Camera permission is required.</Text>
        <Button title="Grant permission" onPress={() => requestPermission()} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        barcodeScannerSettings={isOcrMode ? undefined : { barcodeTypes: PRODUCT_BARCODE_TYPES }}
        onBarcodeScanned={isOcrMode ? undefined : onBarcodeScanned}
        onCameraReady={() => setReady(true)}
        onMountError={(e) => setMessage(e.message || "Camera failed to start.")}
      />
      <View style={[styles.overlay, { paddingBottom: appTheme.spacing.md + insets.bottom }]}>
        <Text style={styles.overlayText}>
          {ocrUnavailable
            ? "Label scanning needs the full app build (not Expo Go). Tap “Type it instead” to enter it by hand."
            : isDateMode
            ? "Fill the frame with the printed USE BY / BEST BEFORE date, then tap Read date."
            : isNameMode
              ? picking
                ? detectedDate
                  ? `Read expiry ${detectedDate}. Tap each line of the name — pick more than one if it wraps:`
                  : "Tap each line of the name — pick more than one if it wraps:"
                : "Fill the frame with the product name on the packaging, then tap Read label."
              : "Point the camera at the product barcode. Closes automatically once scanned."}
        </Text>
        {message ? <Text style={styles.subText}>{message}</Text> : null}

        {isNameMode && picking ? (
          <>
            <ScrollView style={styles.candidates} contentContainerStyle={styles.candidatesContent} keyboardShouldPersistTaps="handled">
              {candidates.map((c, i) => {
                const order = selectedNames.indexOf(c);
                const isSelected = order !== -1;
                return (
                  <Pressable
                    key={`${c}-${i}`}
                    style={({ pressed }) => [styles.candidate, isSelected ? styles.candidateSelected : null, pressed ? styles.candidatePressed : null]}
                    onPress={() => toggleName(c)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isSelected }}
                    accessibilityLabel={`${isSelected ? "Deselect" : "Select"} name line ${c}`}
                  >
                    <View style={[styles.checkBox, isSelected ? styles.checkBoxOn : null]}>
                      {isSelected ? <Text style={styles.checkBoxText}>{order + 1}</Text> : null}
                    </View>
                    <Text style={styles.candidateText} numberOfLines={2}>{c}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            {combinedName ? <Text style={styles.combinedPreview} numberOfLines={2}>Name: {combinedName}</Text> : null}
            <Button
              title={combinedName ? `Use name${selectedNames.length > 1 ? ` (${selectedNames.length} lines)` : ""}` : "Tap a line above"}
              onPress={confirmName}
              disabled={!combinedName}
            />
            <Button title="Retake" onPress={retake} />
          </>
        ) : ocrUnavailable ? null : isDateMode ? (
          <Button title={busy ? "Reading…" : "Read date"} onPress={() => void captureDate()} disabled={busy || !ready} />
        ) : isNameMode ? (
          <Button title={busy ? "Reading…" : "Read label"} onPress={() => void captureName()} disabled={busy || !ready} />
        ) : null}

        <Button title={(isNameMode && picking) || ocrUnavailable ? "Type it instead" : "Cancel"} onPress={cancel} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: appTheme.spacing.lg, gap: appTheme.spacing.sm, backgroundColor: appTheme.colors.background },
  overlay: { position: "absolute", left: 0, right: 0, bottom: 0, padding: appTheme.spacing.md, gap: appTheme.spacing.sm, backgroundColor: "rgba(0,0,0,0.55)" },
  overlayText: { color: "#fff", fontFamily: appTheme.fonts.bodyMedium, fontSize: 14, textAlign: "center" },
  subText: { color: "#ffd", fontFamily: appTheme.fonts.body, fontSize: 12, textAlign: "center" },
  title: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 16, textAlign: "center" },
  text: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body },
  candidates: { maxHeight: 220, alignSelf: "stretch" },
  candidatesContent: { gap: appTheme.spacing.xs },
  candidate: { flexDirection: "row", alignItems: "center", gap: appTheme.spacing.sm, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: appTheme.radius.sm, paddingHorizontal: appTheme.spacing.md, paddingVertical: appTheme.spacing.sm },
  candidateSelected: { backgroundColor: "rgba(96,165,250,0.32)", borderWidth: 1, borderColor: "#93c5fd" },
  candidatePressed: { backgroundColor: "rgba(255,255,255,0.28)" },
  candidateText: { flex: 1, color: "#fff", fontFamily: appTheme.fonts.bodyMedium, fontSize: 15 },
  checkBox: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.6)", alignItems: "center", justifyContent: "center" },
  checkBoxOn: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  checkBoxText: { color: "#fff", fontFamily: appTheme.fonts.bodyMedium, fontSize: 12 },
  combinedPreview: { color: "#fff", fontFamily: appTheme.fonts.bodyMedium, fontSize: 14, textAlign: "center" },
});
