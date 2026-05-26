import { StyleSheet } from "react-native";
import { appTheme, surfaceShadow } from "./theme";

export const ui = StyleSheet.create({
  card: {
    backgroundColor: appTheme.colors.surface,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    borderColor: appTheme.colors.borderSoft,
    padding: appTheme.spacing.lg,
    gap: appTheme.spacing.sm,
    ...surfaceShadow,
  },
  cardMuted: {
    backgroundColor: appTheme.colors.surfaceTint,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    borderColor: appTheme.colors.borderSoft,
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
    borderWidth: 1.5,
    borderColor: "transparent",
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    color: appTheme.colors.text,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: 11,
    fontSize: 14,
    fontFamily: appTheme.fonts.body,
  },
  inputFocused: {
    borderColor: appTheme.colors.primary,
    backgroundColor: appTheme.colors.surface,
  },
  listItem: {
    borderWidth: 0,
    borderRadius: appTheme.radius.sm,
    paddingVertical: appTheme.spacing.sm,
    paddingHorizontal: appTheme.spacing.sm,
    gap: appTheme.spacing.xs,
    backgroundColor: appTheme.colors.surface,
  },
  listItemDivider: {
    borderBottomWidth: 1,
    borderBottomColor: appTheme.colors.borderSoft,
    borderRadius: 0,
  },
});
