import React, { PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Keyboard, Platform, RefreshControlProps, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { appTheme } from "../ui/theme";
import { useIsTablet } from "../utils/useIsTablet";

// On tablet, content is capped at this width and centred. Phones (width < 768) are
// untouched — the existing edge-to-edge layout is preserved exactly.
const TABLET_CONTENT_MAX_WIDTH = 720;

// Inputs anywhere in the tree can call this on focus to nudge the screen scroll so the
// currently-focused field isn't hidden by the keyboard. Without it, tapping "Next" to advance
// can leave the new field under the keyboard if it sits below the visible window.
const ScrollToFocusedContext = React.createContext<() => void>(() => {});

export function useScrollToFocusedInput(): () => void {
  return useContext(ScrollToFocusedContext);
}

type ScreenContainerProps = PropsWithChildren<{
  centerContent?: boolean;
  footer?: React.ReactNode;
  keyboardScrollOffset?: number;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  scrollable?: boolean;
}>;

export function ScreenContainer({
  children,
  centerContent = false,
  footer,
  keyboardScrollOffset = 100,
  refreshControl,
  scrollable = true,
}: ScreenContainerProps) {
  const entrance = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();
  const isTablet = useIsTablet();
  const [keyboardInset, setKeyboardInset] = useState(0);
  // On Android the sticky footer must clear the system navigation bar; SafeAreaView's bottom edge
  // doesn't reliably lift an absolutely-positioned child there, so offset it explicitly.
  const footerBottom =
    Platform.OS === "android" ? insets.bottom + appTheme.spacing.sm : appTheme.spacing.sm;

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
  const footerReserve = hasFooter ? 88 + (Platform.OS === "android" ? insets.bottom : 0) : 0;
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
      // Tablet-only: stop content stretching to the full ~1000px viewport width — cap and centre.
      isTablet
        ? { maxWidth: TABLET_CONTENT_MAX_WIDTH, alignSelf: "center" as const, width: "100%" as const }
        : null,
    ],
    [baseBottomPadding, footerReserve, keyboardInset, isTablet]
  );

  // Expose the scroll-into-view helper to any descendant input via Context. Inputs call it from
  // onFocus so that when "Next" advances focus, the new field is nudged above the keyboard.
  const triggerScrollToFocused = useCallback(() => {
    requestAnimationFrame(scrollFocusedInputIntoView);
  }, [scrollFocusedInputIntoView]);

  return (
    <ScrollToFocusedContext.Provider value={triggerScrollToFocused}>
      <SafeAreaView style={styles.safeArea} edges={["left", "right", "bottom"]}>
        {scrollable ? (
          <ScrollView
            ref={scrollViewRef}
            contentContainerStyle={contentStyle}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
            contentInsetAdjustmentBehavior="automatic"
            nestedScrollEnabled
            refreshControl={refreshControl}
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
        ) : (
          <Animated.View
            style={[
              styles.bodyNoScroll,
              { paddingBottom: keyboardInset + footerReserve, opacity: entrance, transform: [{ translateY }] },
              isTablet
                ? { maxWidth: TABLET_CONTENT_MAX_WIDTH, alignSelf: "center" as const, width: "100%" as const }
                : null,
            ]}
          >
            {children}
          </Animated.View>
        )}
        {footer ? (
          <View
            style={[
              styles.footerShell,
              { bottom: footerBottom },
              // Match the centred content column on tablet so the sticky footer doesn't
              // float against the right edge.
              isTablet ? { maxWidth: TABLET_CONTENT_MAX_WIDTH, alignSelf: "center" as const, left: undefined, right: undefined, width: "100%" } : null,
            ]}
          >
            {footer}
          </View>
        ) : null}
      </SafeAreaView>
    </ScrollToFocusedContext.Provider>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: appTheme.colors.background },
  content: {
    flexGrow: 1,
    paddingHorizontal: appTheme.spacing.md,
    paddingTop: appTheme.spacing.xs,
  },
  body: {
    gap: 16,
  },
  bodyNoScroll: {
    flex: 1,
    paddingHorizontal: appTheme.spacing.md,
    paddingTop: appTheme.spacing.xs,
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
