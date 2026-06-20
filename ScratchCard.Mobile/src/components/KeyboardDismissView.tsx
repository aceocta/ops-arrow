import React from "react";
import { Keyboard, Pressable, StyleProp, ViewStyle } from "react-native";

type Props = {
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

/**
 * A full-area wrapper that dismisses the keyboard when the user taps empty space, while taps on
 * inputs and buttons still work (RN only fires this Pressable when no child claims the touch).
 *
 * Use it as a modal backdrop (or any container holding inputs that aren't inside a
 * keyboardShouldPersistTaps ScrollView). It's the reliable escape hatch for numeric / phone /
 * decimal keypads and multiline fields, which have no "return/Done" key to close the keyboard.
 * It does NOT close the modal — it only drops the keyboard — so existing Cancel/Save buttons are
 * unaffected.
 */
export function KeyboardDismissView({ style, children }: Props) {
  return (
    <Pressable style={style} onPress={() => Keyboard.dismiss()} accessible={false}>
      {children}
    </Pressable>
  );
}

/**
 * Drop-in for a modal/backdrop View's `onStartShouldSetResponder`. An empty-space tap dismisses the
 * keyboard; it returns false so it never captures the touch, leaving inputs/buttons fully working.
 * Use when wrapping the element in a Pressable isn't convenient (e.g. an existing backdrop View):
 *   <View style={styles.backdrop} onStartShouldSetResponder={dismissKeyboardOnTap}>
 */
export function dismissKeyboardOnTap(): boolean {
  Keyboard.dismiss();
  return false;
}
