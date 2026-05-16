import { Appearance, Platform } from "react-native";

export type ThemeMode = "light" | "dark" | "system";

const lightColors = {
  background: "#EEF1F7",
  backgroundAlt: "#E4EAF5",
  surface: "#FFFFFF",
  surfaceMuted: "#F7F9FC",
  surfaceTint: "#F4F8FF",
  surfaceTintAlt: "#EEF3FB",
  surfaceTintSoft: "#F2F6FC",
  surfaceBrandSoft: "#E9F7F6",
  surfaceBrandMuted: "#EAF6F8",
  surfaceInfoSoft: "#E8F2FA",
  surfaceInfoMuted: "#EAF2FF",
  surfaceWarningSoft: "#FFF4E9",
  surfaceWarningMuted: "#FFF9EC",
  surfaceWarningAlt: "#FFF7E6",
  surfaceDangerSoft: "#FFF0F3",
  surfaceDangerMuted: "#FFE2E8",
  surfaceSuccessSoft: "#E8F9ED",
  surfaceSuccessMuted: "#DDF5F1",
  surfaceSuccessAlt: "#E8F5F2",
  surfaceBrandPale: "#DBF3F5",
  surfaceInfoAlt: "#E2ECFB",
  surfaceNeutralSoft: "#F1F6FC",
  surfaceNeutralMuted: "#F6F9FF",
  surfaceNeutralPale: "#F8FBFF",
  border: "#DDE3EF",
  borderStrong: "#CCD5E6",
  borderSoft: "#D9E2EE",
  borderBrandSoft: "#BBDDE2",
  borderInfoSoft: "#C4D7F7",
  borderSuccessSoft: "#A9D9B8",
  borderDangerSoft: "#EEC5CF",
  borderWarningSoft: "#E9C789",
  text: "#172033",
  textMuted: "#5C6680",
  textSubtle: "#8690A6",
  textOnDark: "#DCEAF4",
  textBrandStrong: "#0E5560",
  textSuccessStrong: "#0D5F2D",
  textWarningStrong: "#7A4B00",
  textInfoStrong: "#2B4E83",
  primary: "#0E7A8A",
  primaryPressed: "#0A5D69",
  onPrimary: "#F2FCFF",
  accent: "#F59E0B",
  success: "#059669",
  warning: "#B7791F",
  danger: "#CF3348",
  dangerPressed: "#A9382F",
  info: "#2563EB",
  badgeNeutralBg: "#EDF2FA",
  badgeNeutralBorder: "#D9E1EF",
  badgeWarningBg: "#FFF6E9",
  badgeWarningBorder: "#F2D7A8",
  badgeDangerBg: "#FFF0F3",
  badgeDangerBorder: "#F0C2CC",
  badgeSuccessBg: "#E8FBF5",
  badgeSuccessBorder: "#BCE9D9",
  overlay: "rgba(15, 23, 28, 0.45)",
  overlayStrong: "rgba(10, 20, 30, 0.45)",
  overlaySoft: "rgba(15, 23, 28, 0.34)",
  backdropOrbA: "#DDE5F4",
  backdropOrbB: "#E8EFFB",
};

type AppColors = typeof lightColors;

const darkColors: AppColors = {
  background: "#10151E",
  backgroundAlt: "#151C28",
  surface: "#1A2331",
  surfaceMuted: "#212C3C",
  surfaceTint: "#202C3D",
  surfaceTintAlt: "#1E2938",
  surfaceTintSoft: "#263244",
  surfaceBrandSoft: "#143943",
  surfaceBrandMuted: "#1A3A45",
  surfaceInfoSoft: "#1A314D",
  surfaceInfoMuted: "#1D3554",
  surfaceWarningSoft: "#3A2C1E",
  surfaceWarningMuted: "#463523",
  surfaceWarningAlt: "#4B3926",
  surfaceDangerSoft: "#442733",
  surfaceDangerMuted: "#523441",
  surfaceSuccessSoft: "#1E3A33",
  surfaceSuccessMuted: "#26463D",
  surfaceSuccessAlt: "#2A4D43",
  surfaceBrandPale: "#274850",
  surfaceInfoAlt: "#26364F",
  surfaceNeutralSoft: "#1F2938",
  surfaceNeutralMuted: "#243040",
  surfaceNeutralPale: "#283547",
  border: "#2F3B4E",
  borderStrong: "#435168",
  borderSoft: "#435168",
  borderBrandSoft: "#3E5A65",
  borderInfoSoft: "#455A78",
  borderSuccessSoft: "#3B6453",
  borderDangerSoft: "#6A4A57",
  borderWarningSoft: "#6F5837",
  text: "#E8EFFB",
  textMuted: "#B7C3D8",
  textSubtle: "#8FA1BF",
  textOnDark: "#E6F0FF",
  textBrandStrong: "#7FD0DD",
  textSuccessStrong: "#83DFAE",
  textWarningStrong: "#F2C97A",
  textInfoStrong: "#8FB8FF",
  primary: "#1FA6B8",
  primaryPressed: "#198A9A",
  onPrimary: "#041418",
  accent: "#F6B43B",
  success: "#2CCB92",
  warning: "#D7A04D",
  danger: "#F05A6E",
  dangerPressed: "#D3485B",
  info: "#60A5FA",
  badgeNeutralBg: "#2A3443",
  badgeNeutralBorder: "#3A465A",
  badgeWarningBg: "#3E2F20",
  badgeWarningBorder: "#5A452D",
  badgeDangerBg: "#442733",
  badgeDangerBorder: "#674053",
  badgeSuccessBg: "#1E3A33",
  badgeSuccessBorder: "#2E5A4D",
  overlay: "rgba(0, 0, 0, 0.58)",
  overlayStrong: "rgba(0, 0, 0, 0.66)",
  overlaySoft: "rgba(0, 0, 0, 0.52)",
  backdropOrbA: "#1B2C40",
  backdropOrbB: "#22334A",
};

function normalizeThemeMode(value: string | undefined): ThemeMode {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "light" || normalized === "dark" || normalized === "system") {
    return normalized;
  }
  return "system";
}

function resolveColorScheme(mode: ThemeMode) {
  if (mode === "dark") {
    return "dark" as const;
  }

  if (mode === "light") {
    return "light" as const;
  }

  return Appearance.getColorScheme() === "dark" ? ("dark" as const) : ("light" as const);
}

export const configuredThemeMode = normalizeThemeMode(process.env.EXPO_PUBLIC_THEME_MODE);
export const resolvedColorScheme = "dark";

export const appTheme = {
  colors: resolvedColorScheme === "dark" ? darkColors : lightColors,
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
