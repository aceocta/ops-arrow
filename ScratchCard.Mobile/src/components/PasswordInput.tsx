import React, { forwardRef, useState } from "react";
import { Pressable, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { appTheme } from "../ui/theme";
import { FloatingLabelInput } from "./FloatingLabelInput";

type Props = Omit<React.ComponentPropsWithoutRef<typeof FloatingLabelInput>, "secureTextEntry" | "rightAdornment">;

/**
 * Password field with a built-in show/hide toggle. Wraps FloatingLabelInput so every password entry
 * gets the same masking, a properly-labelled 44pt toggle, and autofill support (pass `textContentType`/
 * `autoComplete` — "password"/"current-password" for sign-in, "newPassword"/"new-password" for
 * create/reset so the OS offers a strong password and password managers capture it).
 */
export const PasswordInput = forwardRef<TextInput, Props>(function PasswordInput(props, ref) {
  const [visible, setVisible] = useState(false);
  return (
    <FloatingLabelInput
      ref={ref}
      secureTextEntry={!visible}
      autoCapitalize="none"
      autoCorrect={false}
      {...props}
      rightAdornment={
        <Pressable
          onPress={() => setVisible((v) => !v)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={visible ? "Hide password" : "Show password"}
        >
          <Ionicons name={visible ? "eye-off-outline" : "eye-outline"} size={20} color={appTheme.colors.textMuted} />
        </Pressable>
      }
    />
  );
});
