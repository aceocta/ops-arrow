import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { appTheme } from "../ui/theme";
import { reportError } from "../utils/crashReporter";

type Props = {
  children: React.ReactNode;
  fallback?: (error: Error, reset: () => void) => React.ReactNode;
};

type State = {
  error: Error | null;
};

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    reportError(error, { componentStack: info.componentStack });
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }

    if (this.props.fallback) {
      return this.props.fallback(error, this.reset);
    }

    return (
      <View style={styles.container}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.message}>
          We hit an unexpected error and have logged it. You can retry, or restart the app if the problem persists.
        </Text>
        {__DEV__ ? <Text style={styles.devDetails}>{error.message}</Text> : null}
        <Pressable style={styles.button} onPress={this.reset} accessibilityRole="button" accessibilityLabel="Retry">
          <Text style={styles.buttonText}>Retry</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: appTheme.spacing.lg,
    backgroundColor: appTheme.colors.background,
    gap: appTheme.spacing.sm,
  },
  title: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.heading,
    fontSize: 22,
    lineHeight: 28,
    textAlign: "center",
  },
  message: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    maxWidth: 360,
  },
  devDetails: {
    color: appTheme.colors.danger,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    lineHeight: 16,
    textAlign: "center",
    marginTop: appTheme.spacing.xs,
  },
  button: {
    marginTop: appTheme.spacing.md,
    backgroundColor: appTheme.colors.primary,
    borderRadius: appTheme.radius.pill,
    paddingVertical: 12,
    paddingHorizontal: 28,
  },
  buttonText: {
    color: appTheme.colors.onPrimary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
});
