import React, { PropsWithChildren, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Keyboard, Platform, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { appTheme } from "../ui/theme";

type ScreenContainerProps = PropsWithChildren<{
  centerContent?: boolean;
  footer?: React.ReactNode;
  keyboardScrollOffset?: number;
}>;

export function ScreenContainer({
  children,
  centerContent = false,
  footer,
  keyboardScrollOffset = 100,
}: ScreenContainerProps) {
  const entrance = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef<ScrollView>(null);
  const [keyboardInset, setKeyboardInset] = useState(0);

  useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      duration: 320,
      useNativeDriver: true,
    }).start();
  }, [entrance]);

  const translateY = entrance.interpolate({
    inputRange: [0, 1],
    outputRange: [10, 0],
  });

  const hasFooter = Boolean(footer);
  const footerReserve = hasFooter ? 88 : 0;
  const baseBottomPadding = appTheme.spacing.xl + appTheme.spacing.md;

  const scrollFocusedInputIntoView = useCallback(() => {
    const focusedInput =
      TextInput.State.currentlyFocusedInput?.() ??
      // Fallback for older RN runtime signatures.
      (TextInput.State.currentlyFocusedField?.() as unknown as number | null);

    if (!focusedInput || !scrollViewRef.current) {
      return;
    }

    scrollViewRef.current.scrollResponderScrollNativeHandleToKeyboard(focusedInput, keyboardScrollOffset, true);
  }, [keyboardScrollOffset]);

  useEffect(() => {
    const keyboardShowEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const keyboardHideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showListener = Keyboard.addListener(keyboardShowEvent, (event) => {
      setKeyboardInset(Math.max(0, event.endCoordinates.height));
      requestAnimationFrame(scrollFocusedInputIntoView);
    });

    const hideListener = Keyboard.addListener(keyboardHideEvent, () => {
      setKeyboardInset(0);
    });

    return () => {
      showListener.remove();
      hideListener.remove();
    };
  }, [scrollFocusedInputIntoView]);

  const contentStyle = useMemo(
    () => [
      styles.content,
      {
        paddingBottom: baseBottomPadding + keyboardInset + footerReserve,
      },
    ],
    [baseBottomPadding, footerReserve, keyboardInset]
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={["left", "right", "bottom"]}>
      <View pointerEvents="none" style={styles.backdrop}>
        <View style={[styles.orb, styles.orbTop]} />
        <View style={[styles.orb, styles.orbBottom]} />
      </View>
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={contentStyle}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
        contentInsetAdjustmentBehavior="automatic"
        nestedScrollEnabled
      >
        <Animated.View
          style={[
            styles.body,
            centerContent ? styles.bodyCentered : null,
            { opacity: entrance, transform: [{ translateY }] },
          ]}
        >
          {children}
        </Animated.View>
      </ScrollView>
      {footer ? (
        <View style={styles.footerShell}>
          {footer}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: appTheme.colors.background },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  orb: {
    position: "absolute",
    borderRadius: 999,
  },
  orbTop: {
    width: 220,
    height: 220,
    top: -124,
    right: -72,
    backgroundColor: appTheme.colors.backdropOrbA,
    opacity: 0.46,
  },
  orbBottom: {
    width: 190,
    height: 190,
    bottom: -92,
    left: -62,
    backgroundColor: appTheme.colors.backdropOrbB,
    opacity: 0.42,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: appTheme.spacing.md,
    paddingTop: appTheme.spacing.xs,
  },
  body: {
    gap: 16,
  },
  bodyCentered: {
    flexGrow: 1,
    justifyContent: "center",
  },
  footerShell: {
    position: "absolute",
    left: appTheme.spacing.md,
    right: appTheme.spacing.md,
    bottom: appTheme.spacing.sm,
  },
});
