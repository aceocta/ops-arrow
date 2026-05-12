import { StyleSheet } from "react-native";
import { appTheme, surfaceShadow } from "./theme";

export const ui = StyleSheet.create({
  card: {
    backgroundColor: appTheme.colors.surface,
    borderRadius: appTheme.radius.md,
    borderWidth: 0,
    padding: appTheme.spacing.lg,
    gap: appTheme.spacing.sm,
    ...surfaceShadow,
  },
  cardMuted: {
    backgroundColor: appTheme.colors.surfaceMuted,
    borderRadius: appTheme.radius.md,
    borderWidth: 0,
    padding: appTheme.spacing.lg,
    gap: appTheme.spacing.sm,
  },
  title: {
    fontSize: 27,
    lineHeight: 32,
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.heading,
  },
  sectionTitle: {
    fontSize: 18,
    lineHeight: 23,
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  bodyText: {
    fontSize: 14,
    lineHeight: 21,
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
  },
  caption: {
    fontSize: 12,
    lineHeight: 17,
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.body,
  },
  input: {
    borderWidth: 0,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    color: appTheme.colors.text,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: 11,
    fontSize: 14,
    fontFamily: appTheme.fonts.body,
  },
  listItem: {
    borderWidth: 0,
    borderRadius: appTheme.radius.sm,
    padding: appTheme.spacing.sm,
    gap: appTheme.spacing.xs,
    backgroundColor: appTheme.colors.surface,
  },
});
