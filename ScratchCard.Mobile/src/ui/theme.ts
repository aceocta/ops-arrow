import { Platform } from "react-native";

export const appTheme = {
  colors: {
    background: "#F2F3F1",
    backgroundAlt: "#ECEEEB",
    surface: "#FFFFFF",
    surfaceMuted: "#F3F4F2",
    border: "#D9DDD7",
    borderStrong: "#C8CEC6",
    text: "#151717",
    textMuted: "#4E5452",
    textSubtle: "#707774",
    primary: "#1A1B1D",
    primaryPressed: "#0F1011",
    onPrimary: "#F7F8F7",
    accent: "#D79A45",
    success: "#2D8C5D",
    warning: "#A56A16",
    danger: "#BE4A41",
    info: "#2F3D4A",
    badgeNeutralBg: "#ECEFED",
    badgeNeutralBorder: "#D3D8D1",
    badgeWarningBg: "#FDF3E3",
    badgeWarningBorder: "#E6CC9F",
    badgeDangerBg: "#FBE8E6",
    badgeDangerBorder: "#E6B7B2",
    badgeSuccessBg: "#E5F3EA",
    badgeSuccessBorder: "#BEDDC9",
    backdropOrbA: "#E0E3DE",
    backdropOrbB: "#E9EBE7",
  },
  spacing: {
    xs: 8,
    sm: 12,
    md: 16,
    lg: 20,
    xl: 28,
  },
  radius: {
    sm: 12,
    md: 16,
    lg: 24,
    pill: 999,
  },
  fonts: {
    heading: Platform.select({
      ios: "AvenirNext-Bold",
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

export const surfaceShadow =
  Platform.OS === "ios"
    ? {
        shadowColor: "#151717",
        shadowOpacity: 0.08,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
      }
    : Platform.OS === "android"
      ? {
          elevation: 5,
        }
      : {};
