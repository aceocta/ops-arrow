import { Platform } from "react-native";

export const appTheme = {
  colors: {
    background: "#EEF1F7",
    backgroundAlt: "#E4EAF5",
    surface: "#FFFFFF",
    surfaceMuted: "#F7F9FC",
    border: "#DDE3EF",
    borderStrong: "#CCD5E6",
    text: "#172033",
    textMuted: "#5C6680",
    textSubtle: "#8690A6",
    primary: "#0E7A8A",
    primaryPressed: "#0A5D69",
    onPrimary: "#F2FCFF",
    accent: "#F59E0B",
    success: "#059669",
    warning: "#B7791F",
    danger: "#CF3348",
    info: "#2563EB",
    badgeNeutralBg: "#EDF2FA",
    badgeNeutralBorder: "#D9E1EF",
    badgeWarningBg: "#FFF6E9",
    badgeWarningBorder: "#F2D7A8",
    badgeDangerBg: "#FFF0F3",
    badgeDangerBorder: "#F0C2CC",
    badgeSuccessBg: "#E8FBF5",
    badgeSuccessBorder: "#BCE9D9",
    backdropOrbA: "#DDE5F4",
    backdropOrbB: "#E8EFFB",
  },
  spacing: {
    xs: 8,
    sm: 12,
    md: 16,
    lg: 20,
    xl: 28,
  },
  radius: {
    sm: 14,
    md: 20,
    lg: 28,
    pill: 999,
  },
  fonts: {
    heading: Platform.select({
      ios: "AvenirNext-DemiBold",
      android: "sans-serif-black",
      default: "System",
    }),
    body: Platform.select({
      ios: "AvenirNext-Regular",
      android: "sans-serif",
      default: "System",
    }),
    bodyMedium: Platform.select({
      ios: "AvenirNext-Medium",
      android: "sans-serif-medium",
      default: "System",
    }),
  },
} as const;

export const surfaceShadow = {};
