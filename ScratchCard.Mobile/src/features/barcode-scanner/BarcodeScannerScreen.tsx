import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import Constants from "expo-constants";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../types/navigation";
import { emitScan } from "./scanBus";
import { parseTicketText } from "./parseTicketText";

type Props = NativeStackScreenProps<RootStackParamList, "BarcodeScanner">;

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

export function BarcodeScannerScreen({ navigation, route }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [isProcessingOcr, setIsProcessingOcr] = useState(false);
  const [isAutoOcrEnabled, setIsAutoOcrEnabled] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [lastScanMessage, setLastScanMessage] = useState<string>("");
  const cameraRef = useRef<CameraView | null>(null);
  const hasHandledPackBarcodeRef = useRef(false);

  const canScan = useMemo(() => permission?.granted ?? false, [permission]);
  const mode = route.params.mode ?? "single";
  const isManualPackScanMode = mode === "single" && !route.params.packId && !route.params.packNumber;

  useEffect(() => {
    setIsAutoOcrEnabled(mode === "auto");
    setLastScanMessage("");
    hasHandledPackBarcodeRef.current = false;
  }, [route.params.packId, route.params.packNumber, mode]);

  const onBarcodeScanned = useCallback((result: { data: string; type?: string }) => {
    if (!isManualPackScanMode || hasHandledPackBarcodeRef.current) {
      return;
    }

    const rawData = `${result.data ?? ""}`.trim();
    if (!rawData) {
      return;
    }

    const parsed = parseScannedPackCode(rawData);
    if (!parsed) {
      setLastScanMessage("Detected barcode, but pack number could not be parsed. Try a clearer angle.");
      return;
    }

    hasHandledPackBarcodeRef.current = true;

    emitScan({
      rawBarcode: rawData,
      parsedPackNumber: `${parsed.gameCode}-${parsed.packComponent}`,
      parsedSerial: "",
      barcodeType: result.type,
    });

    setLastScanMessage(`Scanned game ${parsed.gameCode}, pack ${parsed.packComponent}.`);
    navigation.goBack();
  }, [isManualPackScanMode, navigation]);

  async function recognizeTextWithMlkit(imageUri: string) {
    if (Constants.appOwnership === "expo" || Constants.executionEnvironment === "storeClient") {
      throw new Error("MLKit OCR requires a development build. Open this app with dev client, not Expo Go.");
    }

    try {
      const module = (await import("@infinitered/react-native-mlkit-text-recognition")) as any;
      const recognizeTextFn =
        module?.recognizeText ??
        module?.default?.recognizeText ??
        (typeof module?.default === "function" ? module.default : undefined);

      if (typeof recognizeTextFn !== "function") {
        throw new Error("MLKit recognizeText export was not found in loaded module.");
      }

      return await recognizeTextFn(imageUri);
    } catch (error: any) {
      const message = String(error?.message ?? "");
      if (
        message.toLowerCase().includes("cannot find native module") ||
        message.includes("RNMLKitTextRecognition") ||
        message.includes("recognizeText export was not found")
      ) {
        throw new Error(
          "MLKit native module is not in this app build. Rebuild using `npm run android`/`npm run ios` (Expo Go is not supported)."
        );
      }

      throw error;
    }
  }

  const runMlkitOcrFallback = useCallback(async (): Promise<boolean> => {
    if (isProcessingOcr) {
      return false;
    }

    if (!cameraRef.current || !isCameraReady) {
      setLastScanMessage("Camera is not ready for OCR yet.");
      return false;
    }

    setIsProcessingOcr(true);
    try {
      const captured = await cameraRef.current.takePictureAsync({
        quality: 0.5,
        skipProcessing: true,
        shutterSound: false,
      });

      if (!captured?.uri) {
        setLastScanMessage("OCR capture failed. Try again.");
        return false;
      }

      const recognized = await recognizeTextWithMlkit(captured.uri);
      const parsedFromText = parseTicketText(recognized.text, mode === "single" ? route.params.packNumber : undefined);

      if (!parsedFromText) {
        setLastScanMessage("OCR could not read ticket code. Try flatter image with better light.");
        return false;
      }

      emitScan({
        packId: route.params.packId,
        parsedPackNumber: parsedFromText.parsedPackNumber,
        rawBarcode: parsedFromText.rawBarcode,
        parsedSerial: parsedFromText.parsedSerial,
        barcodeType: "mlkit-text",
      });

      setLastScanMessage(`OCR captured: ${parsedFromText.rawBarcode}`);
      if (mode === "auto") {
        return true;
      }

      setIsAutoOcrEnabled(false);
      navigation.goBack();
      return true;
    } catch (error: any) {
      setLastScanMessage(error?.message ?? "OCR failed. Try again.");
      return false;
    } finally {
      setIsProcessingOcr(false);
    }
  }, [isProcessingOcr, isCameraReady, mode, navigation, route.params.packId, route.params.packNumber]);

  useEffect(() => {
    if (!isAutoOcrEnabled || !isCameraReady) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = (delayMs: number) => {
      timer = setTimeout(async () => {
        if (cancelled) {
          return;
        }

        const captured = await runMlkitOcrFallback();
        if (cancelled) {
          return;
        }

        schedule(captured ? 1500 : 700);
      }, delayMs);
    };

    schedule(350);

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [isAutoOcrEnabled, isCameraReady, runMlkitOcrFallback]);

  if (!permission) {
    return <View style={styles.center}><Text>Checking camera permissions...</Text></View>;
  }

  if (!canScan) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Camera permission is required.</Text>
        <Button title="Grant Permission" onPress={() => requestPermission()} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        onCameraReady={() => setIsCameraReady(true)}
        onBarcodeScanned={isManualPackScanMode ? onBarcodeScanned : undefined}
      />
      <View style={styles.overlay}>
        <Text style={styles.overlayText}>
          {isManualPackScanMode
            ? "Point the camera at a pack barcode. Scanner closes automatically after pack number is captured."
            : mode === "auto"
              ? "Auto OCR Mode: keep ticket text visible and app will capture automatically."
              : `OCR capture for pack ${route.params.packNumber ?? "-"}`}
        </Text>
        {lastScanMessage ? <Text style={styles.subText}>{lastScanMessage}</Text> : null}
        {isManualPackScanMode ? (
          <Button title="Done" onPress={() => navigation.goBack()} />
        ) : (
          <>
            <Button
              title={isProcessingOcr ? "Reading Text..." : "Capture Text"}
              onPress={() => {
                void runMlkitOcrFallback();
              }}
              disabled={isProcessingOcr || !isCameraReady}
            />
            <Button
              title={isAutoOcrEnabled ? "Auto OCR: On" : "Auto OCR: Off"}
              onPress={() => setIsAutoOcrEnabled((previous) => !previous)}
              disabled={!isCameraReady}
            />
            {mode === "auto" ? <Button title="Done" onPress={() => navigation.goBack()} /> : null}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "black" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, gap: 12 },
  title: { fontSize: 18, fontWeight: "700", textAlign: "center" },
  overlay: {
    position: "absolute",
    bottom: 40,
    left: 20,
    right: 20,
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: 14,
    borderRadius: 8,
  },
  overlayText: { color: "white", textAlign: "center", fontWeight: "600" },
  subText: { color: "#D4FCE9", textAlign: "center", marginTop: 8, marginBottom: 8 },
});
