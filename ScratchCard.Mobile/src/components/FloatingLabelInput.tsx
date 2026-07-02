import React, { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from "react-native";
import { appTheme } from "../ui/theme";
import { useScrollToFocusedInput } from "./ScreenContainer";

type Props = Omit<TextInputProps, "placeholder"> & {
  label: string;
  error?: string | null;
  /** Optional currency or unit prefix shown inside the input (e.g. "£"). */
  prefix?: string;
  /** Optional control rendered at the right edge inside the field (e.g. a password show/hide toggle). */
  rightAdornment?: React.ReactNode;
  /** Extra style for the field container — e.g. to square corners when joined to another control. */
  containerStyle?: StyleProp<ViewStyle>;
};

export const FloatingLabelInput = forwardRef<TextInput, Props>(function FloatingLabelInput(
  { label, error, prefix, value, onFocus, onBlur, containerStyle, rightAdornment, ...rest },
  ref,
) {
  const innerRef = useRef<TextInput>(null);
  const inputRef = (ref as React.RefObject<TextInput>) ?? innerRef;
  const scrollToFocused = useScrollToFocusedInput();
  const [isFocused, setIsFocused] = useState(false);
  const hasValue = Boolean(value && String(value).length > 0);
  const floated = isFocused || hasValue;
  const anim = useRef(new Animated.Value(floated ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: floated ? 1 : 0,
      duration: 160,
      useNativeDriver: false,
    }).start();
  }, [anim, floated]);

  const handleFocus = useCallback(
    (event: Parameters<NonNullable<TextInputProps["onFocus"]>>[0]) => {
      setIsFocused(true);
      onFocus?.(event);
      // If this input would land under the keyboard (typical when "Next" advances to a field
      // below the visible area), nudge the screen scroll so the field stays in view.
      scrollToFocused();
    },
    [onFocus, scrollToFocused],
  );

  const handleBlur = useCallback(
    (event: Parameters<NonNullable<TextInputProps["onBlur"]>>[0]) => {
      setIsFocused(false);
      onBlur?.(event);
    },
    [onBlur],
  );

  const labelTop = anim.interpolate({ inputRange: [0, 1], outputRange: [18, 6] });
  const labelFontSize = anim.interpolate({ inputRange: [0, 1], outputRange: [14, 11] });
  // When a prefix (e.g. "£") is shown, nudge the resting placeholder label right so it sits after the
  // prefix ("£ Amount") instead of on top of it; the floated label returns to the left edge.
  const labelLeft = prefix
    ? anim.interpolate({ inputRange: [0, 1], outputRange: [appTheme.spacing.sm + 18, appTheme.spacing.sm] })
    : appTheme.spacing.sm;
  const labelColor = error
    ? appTheme.colors.danger
    : isFocused
      ? appTheme.colors.primary
      : appTheme.colors.textMuted;

  return (
    <Pressable onPress={() => inputRef.current?.focus()} accessible={false}>
      <View
        style={[
          styles.container,
          isFocused ? styles.containerFocused : null,
          error ? styles.containerError : null,
          containerStyle,
        ]}
      >
        <Animated.Text
          style={[
            styles.label,
            { top: labelTop, left: labelLeft, fontSize: labelFontSize, color: labelColor },
          ]}
          pointerEvents="none"
        >
          {label}
        </Animated.Text>
        <View style={styles.row}>
          {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}
          <TextInput
            ref={inputRef}
            {...rest}
            value={value}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholderTextColor={appTheme.colors.textSubtle}
            style={styles.input}
          />
          {rightAdornment ? <View style={styles.adornment}>{rightAdornment}</View> : null}
        </View>
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: appTheme.colors.surfaceMuted,
    borderRadius: appTheme.radius.sm,
    borderWidth: 1.5,
    borderColor: "transparent",
    paddingHorizontal: appTheme.spacing.sm,
    paddingTop: 22,
    paddingBottom: 8,
    position: "relative",
  },
  containerFocused: {
    borderColor: appTheme.colors.primary,
    backgroundColor: appTheme.colors.surface,
  },
  containerError: {
    borderColor: appTheme.colors.danger,
  },
  label: {
    position: "absolute",
    left: appTheme.spacing.sm,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  prefix: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
  },
  input: {
    flex: 1,
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.body,
    fontSize: 15,
    padding: 0,
    margin: 0,
  },
  adornment: {
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: {
    color: appTheme.colors.danger,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    marginTop: 4,
    marginLeft: appTheme.spacing.sm,
  },
});
