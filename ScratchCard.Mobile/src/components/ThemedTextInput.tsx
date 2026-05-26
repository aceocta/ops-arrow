import React, { forwardRef, useCallback, useState } from "react";
import { TextInput, TextInputProps, StyleSheet, Text, View, ViewStyle, StyleProp } from "react-native";
import { ui } from "../ui/primitives";
import { appTheme } from "../ui/theme";

type ThemedTextInputProps = Omit<TextInputProps, "style"> & {
  containerStyle?: StyleProp<ViewStyle>;
  style?: TextInputProps["style"];
  /** Optional currency or unit prefix shown inside the input (e.g. "£"). */
  prefix?: string;
  /** Optional unit suffix shown inside the input (e.g. "%", "kg"). */
  suffix?: string;
  /** Inline error message. When set, the border turns danger. */
  error?: string | null;
};

export const ThemedTextInput = forwardRef<TextInput, ThemedTextInputProps>(function ThemedTextInput(
  { containerStyle, style, prefix, suffix, error, onFocus, onBlur, ...rest },
  ref,
) {
  const [isFocused, setIsFocused] = useState(false);

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

  const showAdornments = Boolean(prefix) || Boolean(suffix);

  if (!showAdornments) {
    return (
      <TextInput
        ref={ref}
        {...rest}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholderTextColor={appTheme.colors.textSubtle}
        style={[
          ui.input,
          isFocused ? ui.inputFocused : null,
          error ? styles.errorBorder : null,
          style,
        ]}
      />
    );
  }

  return (
    <View
      style={[
        ui.input,
        styles.row,
        isFocused ? ui.inputFocused : null,
        error ? styles.errorBorder : null,
        containerStyle,
      ]}
    >
      {prefix ? <Text style={styles.adornment}>{prefix}</Text> : null}
      <TextInput
        ref={ref}
        {...rest}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholderTextColor={appTheme.colors.textSubtle}
        style={[styles.bareInput, style]}
      />
      {suffix ? <Text style={styles.adornment}>{suffix}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 0,
    gap: 6,
  },
  bareInput: {
    flex: 1,
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.body,
    fontSize: 14,
    paddingVertical: 11,
  },
  adornment: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
  },
  errorBorder: {
    borderColor: appTheme.colors.danger,
  },
});
