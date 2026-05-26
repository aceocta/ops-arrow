import React, { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from "react-native";
import { appTheme } from "../ui/theme";

type Props = Omit<TextInputProps, "placeholder"> & {
  label: string;
  error?: string | null;
  /** Optional currency or unit prefix shown inside the input (e.g. "£"). */
  prefix?: string;
};

export const FloatingLabelInput = forwardRef<TextInput, Props>(function FloatingLabelInput(
  { label, error, prefix, value, onFocus, onBlur, ...rest },
  ref,
) {
  const innerRef = useRef<TextInput>(null);
  const inputRef = (ref as React.RefObject<TextInput>) ?? innerRef;
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
    },
    [onFocus],
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
        ]}
      >
        <Animated.Text
          style={[
            styles.label,
            { top: labelTop, fontSize: labelFontSize, color: labelColor },
          ]}
          pointerEvents="none"
        >
          {label}
        </Animated.Text>
        <View style={styles.row}>
          {prefix && floated ? <Text style={styles.prefix}>{prefix}</Text> : null}
          <TextInput
            ref={inputRef}
            {...rest}
            value={value}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholderTextColor={appTheme.colors.textSubtle}
            style={styles.input}
          />
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
  errorText: {
    color: appTheme.colors.danger,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    marginTop: 4,
    marginLeft: appTheme.spacing.sm,
  },
});
