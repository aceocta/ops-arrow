import React, { useState } from "react";
import { Alert, StyleSheet, Text, TextInput, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { FloatingLabelInput } from "../../components/FloatingLabelInput";
import { ScreenContainer } from "../../components/ScreenContainer";
import { PrimaryButton } from "../../components/PrimaryButton";
import { acceptInvitation } from "../../api/authApi";
import { RootStackParamList } from "../../types/navigation";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

type Props = NativeStackScreenProps<RootStackParamList, "InvitationAccept">;

export function InvitationAcceptanceScreen({ route, navigation }: Props) {
  const [token, setToken] = useState(route.params?.token ?? "");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  React.useEffect(() => {
    const incomingToken = route.params?.token?.trim();
    if (incomingToken && incomingToken.length > 0) {
      setToken(incomingToken);
    }
  }, [route.params?.token]);

  async function onAccept() {
    if (!token.trim()) {
      Alert.alert("Validation", "Invitation token is required.");
      return;
    }
    if (!firstName.trim()) {
      Alert.alert("Validation", "First name is required.");
      return;
    }
    if (!lastName.trim()) {
      Alert.alert("Validation", "Last name is required.");
      return;
    }
    if (!password || password.length < 8) {
      Alert.alert("Validation", "Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("Validation", "Passwords do not match.");
      return;
    }

    setIsBusy(true);
    try {
      await acceptInvitation({
        token: token.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        password
      });
      navigation.reset({
        index: 0,
        routes: [{ name: "Login" }],
      });
      Alert.alert("Invitation accepted", "You can now sign in with your email and password.");
    } catch (error: any) {
      Alert.alert("Failed", error?.response?.data?.message ?? "Could not accept invitation.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <ScreenContainer>
      <View style={ui.card}>
        <Text style={styles.title}>Accept Invitation</Text>
        <Text style={styles.subtitle}>Enter your details to set up your account and join the shop.</Text>
        <FloatingLabelInput label="Invitation token" value={token} onChangeText={setToken} editable={!isBusy} />
        <FloatingLabelInput label="First name" value={firstName} onChangeText={setFirstName} editable={!isBusy} />
        <FloatingLabelInput label="Last name" value={lastName} onChangeText={setLastName} editable={!isBusy} />
        <FloatingLabelInput
          label="Password (min 8 characters)"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          editable={!isBusy}
        />
        <FloatingLabelInput
          label="Confirm password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          editable={!isBusy}
        />
        <PrimaryButton label={isBusy ? "Accepting..." : "Accept Invitation"} onPress={() => void onAccept()} disabled={isBusy} />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: {
    color: appTheme.colors.text,
    fontSize: 20,
    lineHeight: 24,
    fontFamily: appTheme.fonts.heading,
  },
  subtitle: {
    color: appTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: appTheme.fonts.body,
  },
  label: {
    color: appTheme.colors.text,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  input: {
    borderWidth: 1,
    borderColor: appTheme.colors.borderStrong,
    borderRadius: appTheme.radius.sm,
    padding: 12,
    backgroundColor: appTheme.colors.surfaceMuted,
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.body,
  },
});
