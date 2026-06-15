import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import { Canvas, Fill, Path, Skia, SkPath, useCanvasRef } from "@shopify/react-native-skia";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";

export type SignaturePadRef = {
  clear: () => void;
  /** Removes the last stroke. */
  undo: () => void;
  isEmpty: () => boolean;
  /** PNG data URL on a white background, or null if nothing was drawn. */
  toDataUrl: () => string | null;
};

type Point = { x: number; y: number };
type Stroke = Point[];

type Props = {
  /** Fires whenever the number of committed strokes changes (drive Save/Undo enabled state). */
  onStrokeCountChange?: (count: number) => void;
  inkColor?: string;
  strokeWidth?: number;
  style?: ViewStyle;
};

// Build a smooth Skia path from raw points using quadratic segments through midpoints.
function strokeToPath(points: Stroke): SkPath {
  const path = Skia.Path.Make();
  if (points.length === 0) return path;
  path.moveTo(points[0].x, points[0].y);
  if (points.length < 3) {
    for (let i = 1; i < points.length; i += 1) path.lineTo(points[i].x, points[i].y);
    return path;
  }
  for (let i = 1; i < points.length - 1; i += 1) {
    const midX = (points[i].x + points[i + 1].x) / 2;
    const midY = (points[i].y + points[i + 1].y) / 2;
    path.quadTo(points[i].x, points[i].y, midX, midY);
  }
  const last = points[points.length - 1];
  path.lineTo(last.x, last.y);
  return path;
}

/**
 * Native Skia signing surface drawn on the UI thread for low-latency ink. Smooth round strokes;
 * exposes clear / undo / isEmpty / toDataUrl through a ref so the host modal owns the chrome.
 */
export const SignaturePad = forwardRef<SignaturePadRef, Props>(function SignaturePad(
  { onStrokeCountChange, inkColor = "#11181C", strokeWidth = 3, style },
  ref,
) {
  const canvasRef = useCanvasRef();
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [current, setCurrent] = useState<Stroke | null>(null);
  // Mirror of the active stroke so finalize can read it synchronously without nesting setState calls.
  const currentRef = useRef<Stroke | null>(null);

  // Report the count from an effect — never from inside a setState updater (that runs during render
  // and would update the parent mid-render → "Cannot update a component while rendering another").
  useEffect(() => {
    onStrokeCountChange?.(strokes.length);
  }, [strokes.length, onStrokeCountChange]);

  const begin = useCallback((x: number, y: number) => {
    const s: Stroke = [{ x, y }];
    currentRef.current = s;
    setCurrent(s);
  }, []);
  const move = useCallback((x: number, y: number) => {
    const s: Stroke = [...(currentRef.current ?? []), { x, y }];
    currentRef.current = s;
    setCurrent(s);
  }, []);
  const finalize = useCallback(() => {
    const s = currentRef.current;
    currentRef.current = null;
    setCurrent(null);
    if (s && s.length > 0) setStrokes((prev) => [...prev, s]);
  }, []);

  // minDistance 0 so a quick dot/short stroke still registers.
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .onBegin((e) => {
          runOnJS(begin)(e.x, e.y);
        })
        .onUpdate((e) => {
          runOnJS(move)(e.x, e.y);
        })
        .onFinalize(() => {
          runOnJS(finalize)();
        }),
    [begin, move, finalize],
  );

  // Committed strokes only rebuild when a stroke ends — the active stroke rebuilds each move.
  const committedPaths = useMemo(() => strokes.map(strokeToPath), [strokes]);
  const currentPath = current ? strokeToPath(current) : null;

  useImperativeHandle(
    ref,
    () => ({
      clear: () => {
        currentRef.current = null;
        setStrokes([]);
        setCurrent(null);
      },
      undo: () => setStrokes((s) => s.slice(0, -1)),
      isEmpty: () => strokes.length === 0 && (currentRef.current?.length ?? 0) === 0,
      toDataUrl: () => {
        if (strokes.length === 0 && (currentRef.current?.length ?? 0) === 0) return null;
        const image = canvasRef.current?.makeImageSnapshot();
        if (!image) return null;
        return `data:image/png;base64,${image.encodeToBase64()}`;
      },
    }),
    [strokes, canvasRef],
  );

  return (
    <View style={[styles.wrap, style]}>
      <GestureDetector gesture={pan}>
        <Canvas style={StyleSheet.absoluteFill} ref={canvasRef}>
          <Fill color="white" />
          {committedPaths.map((p, i) => (
            <Path key={i} path={p} style="stroke" strokeWidth={strokeWidth} strokeCap="round" strokeJoin="round" color={inkColor} />
          ))}
          {currentPath ? (
            <Path path={currentPath} style="stroke" strokeWidth={strokeWidth} strokeCap="round" strokeJoin="round" color={inkColor} />
          ) : null}
        </Canvas>
      </GestureDetector>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
});
