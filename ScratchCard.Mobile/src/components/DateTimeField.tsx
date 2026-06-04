import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import React, { useMemo, useState } from "react";
import { Modal, Platform, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { appTheme, resolvedColorScheme } from "../ui/theme";

type DateTimeFieldMode = "date" | "time" | "datetime";

type DateTimeFieldProps = {
  mode: DateTimeFieldMode;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minimumDate?: Date;
  maximumDate?: Date;
  style?: StyleProp<ViewStyle>;
  /** Extra style for the inner bordered box — e.g. flex/height to match an adjacent field. */
  fieldStyle?: StyleProp<ViewStyle>;
  borderless?: boolean;
};

const pad = (value: number) => `${value}`.padStart(2, "0");

function DateTimeIndicator({ mode }: { mode: "date" | "time" }) {
  if (mode === "date") {
    return (
      <View style={styles.calendarIcon}>
        <View style={styles.calendarTopBar} />
        <View style={styles.calendarBody} />
      </View>
    );
  }

  return (
    <View style={styles.clockIcon}>
      <View style={styles.clockHandHour} />
      <View style={styles.clockHandMinute} />
    </View>
  );
}

export function formatDateValue(value: Date) {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

export function formatTimeValue(value: Date) {
  return `${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

export function formatDateTimeValue(value: Date) {
  return `${formatDateValue(value)} ${formatTimeValue(value)}`;
}

export function parseDateValue(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const [, year, month, day] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0, 0);

  if (
    parsed.getFullYear() !== Number(year) ||
    parsed.getMonth() !== Number(month) - 1 ||
    parsed.getDate() !== Number(day)
  ) {
    return null;
  }

  return parsed;
}

export function parseTimeValue(value: string): Date | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const [, hours, minutes] = match;
  const now = new Date();
  now.setHours(Number(hours), Number(minutes), 0, 0);

  if (Number(hours) > 23 || Number(minutes) > 59) {
    return null;
  }

  return now;
}

export function parseDateTimeValue(value: string): Date | null {
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }

  const parsedDate = parseDateValue(match[1]);
  const parsedTime = parseTimeValue(match[2]);
  if (!parsedDate || !parsedTime) {
    return null;
  }

  const next = new Date(parsedDate);
  next.setHours(parsedTime.getHours(), parsedTime.getMinutes(), 0, 0);
  return next;
}

export function DateTimeField({
  mode,
  value,
  onChange,
  placeholder,
  minimumDate,
  maximumDate,
  style,
  fieldStyle,
  borderless = false,
}: DateTimeFieldProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [androidDateTimeStage, setAndroidDateTimeStage] = useState<"date" | "time" | null>(null);
  const [androidDateTimeDraft, setAndroidDateTimeDraft] = useState<Date | null>(null);

  const pickerValue = useMemo(() => {
    if (mode === "datetime") {
      if (Platform.OS === "android" && androidDateTimeStage === "time" && androidDateTimeDraft) {
        return androidDateTimeDraft;
      }

      return parseDateTimeValue(value) ?? new Date();
    }

    if (mode === "date") {
      return parseDateValue(value) ?? new Date();
    }

    return parseTimeValue(value) ?? new Date();
  }, [androidDateTimeDraft, androidDateTimeStage, mode, value]);

  const displayValue = useMemo(() => {
    if (!value) {
      if (mode === "datetime") {
        return placeholder ?? "Select date & time";
      }
      return placeholder ?? (mode === "date" ? "Select date" : "Select time");
    }

    if (mode === "datetime") {
      const parsed = parseDateTimeValue(value);
      return parsed
        ? parsed.toLocaleString([], {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })
        : value;
    }

    if (mode === "date") {
      const parsed = parseDateValue(value);
      return parsed ? parsed.toLocaleDateString() : value;
    }

    const parsed = parseTimeValue(value);
    return parsed ? parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : value;
  }, [mode, placeholder, value]);

  const handleChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (mode === "datetime" && Platform.OS === "android") {
      if (event.type === "dismissed" || event.type === "neutralButtonPressed" || !selected) {
        setShowPicker(false);
        setAndroidDateTimeStage(null);
        setAndroidDateTimeDraft(null);
        return;
      }

      if (androidDateTimeStage === "date") {
        const current = parseDateTimeValue(value) ?? new Date();
        const dateDraft = new Date(selected);
        dateDraft.setHours(current.getHours(), current.getMinutes(), 0, 0);
        setAndroidDateTimeDraft(dateDraft);
        setAndroidDateTimeStage("time");
        return;
      }

      const next = new Date(androidDateTimeDraft ?? parseDateTimeValue(value) ?? new Date());
      next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
      onChange(formatDateTimeValue(next));
      setShowPicker(false);
      setAndroidDateTimeStage(null);
      setAndroidDateTimeDraft(null);
      return;
    }

    if (Platform.OS === "android") {
      setShowPicker(false);
    }

    if (event.type === "dismissed" || event.type === "neutralButtonPressed" || !selected) {
      return;
    }

    if (mode === "date") {
      onChange(formatDateValue(selected));
      return;
    }

    if (mode === "time") {
      onChange(formatTimeValue(selected));
      return;
    }

    onChange(formatDateTimeValue(selected));
  };

  const pickerMode = useMemo(() => {
    if (mode !== "datetime") {
      return mode;
    }

    if (Platform.OS === "android") {
      return androidDateTimeStage === "time" ? "time" : "date";
    }

    return "datetime";
  }, [androidDateTimeStage, mode]);

  return (
    <View style={[styles.wrap, style]}>
      <Pressable
        style={[styles.field, borderless ? styles.fieldBorderless : null, fieldStyle]}
        onPress={() => {
          if (mode === "datetime" && Platform.OS === "android") {
            setAndroidDateTimeStage("date");
            setAndroidDateTimeDraft(parseDateTimeValue(value) ?? new Date());
            setShowPicker(true);
            return;
          }

          setShowPicker((current) => (Platform.OS === "ios" ? !current : true));
        }}
      >
        <Text style={styles.valueText}>{displayValue}</Text>
        <DateTimeIndicator mode={mode === "time" ? "time" : "date"} />
      </Pressable>

      {/* Android: native dialog — renders regardless of the field's width, so no clipping. */}
      {showPicker && Platform.OS !== "ios" ? (
        <DateTimePicker
          mode={pickerMode}
          value={pickerValue}
          onChange={handleChange}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          display="default"
          themeVariant={resolvedColorScheme === "dark" ? "dark" : "light"}
          textColor={appTheme.colors.text}
          accentColor={appTheme.colors.primary}
          is24Hour
        />
      ) : null}

      {/* iOS: render the inline/spinner picker in a centered modal so a narrow field can't clip it. */}
      {Platform.OS === "ios" ? (
        <Modal visible={showPicker} transparent animationType="fade" onRequestClose={() => setShowPicker(false)}>
          <Pressable style={styles.iosBackdrop} onPress={() => setShowPicker(false)}>
            <Pressable style={styles.iosPickerCard} onPress={() => {}}>
              <DateTimePicker
                mode={pickerMode}
                value={pickerValue}
                onChange={handleChange}
                minimumDate={minimumDate}
                maximumDate={maximumDate}
                display={mode === "date" ? "inline" : "spinner"}
                // Pin the picker to the APP theme, not the device appearance — otherwise a light app
                // on a dark-mode device (or vice versa) renders the dates invisible.
                themeVariant={resolvedColorScheme === "dark" ? "dark" : "light"}
                textColor={appTheme.colors.text}
                accentColor={appTheme.colors.primary}
                is24Hour
                style={styles.iosPicker}
              />
              <Pressable style={styles.doneButton} onPress={() => setShowPicker(false)}>
                <Text style={styles.doneText}>Done</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  field: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.sm,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  fieldBorderless: {
    borderWidth: 0,
  },
  valueText: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.body,
    fontSize: 14,
  },
  calendarIcon: {
    width: 18,
    height: 18,
    borderWidth: 1.5,
    borderColor: appTheme.colors.primary,
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: appTheme.colors.surface,
  },
  calendarTopBar: {
    height: 5,
    backgroundColor: appTheme.colors.primary,
  },
  calendarBody: {
    flex: 1,
    backgroundColor: appTheme.colors.surface,
  },
  clockIcon: {
    width: 18,
    height: 18,
    borderWidth: 1.5,
    borderColor: appTheme.colors.primary,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  clockHandHour: {
    position: "absolute",
    width: 1.5,
    height: 5,
    borderRadius: 1,
    backgroundColor: appTheme.colors.primary,
    top: 4,
  },
  clockHandMinute: {
    position: "absolute",
    width: 4,
    height: 1.5,
    borderRadius: 1,
    backgroundColor: appTheme.colors.primary,
    right: 4,
  },
  pickerWrap: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
    overflow: "hidden",
  },
  pickerWrapBorderless: {
    borderWidth: 0,
  },
  doneButton: {
    borderTopWidth: 1,
    borderTopColor: appTheme.colors.border,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  doneButtonBorderless: {
    borderTopWidth: 0,
  },
  doneText: {
    color: appTheme.colors.primary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
  },
  // iOS picker overlay — centered card wide enough for the inline calendar / spinner.
  iosBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  iosPickerCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: appTheme.colors.surface,
    borderRadius: appTheme.radius.md,
    overflow: "hidden",
  },
  iosPicker: {
    alignSelf: "stretch",
  },
});
