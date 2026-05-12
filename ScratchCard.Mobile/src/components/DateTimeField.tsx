import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import React, { useMemo, useState } from "react";
import { Platform, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { appTheme } from "../ui/theme";

type DateTimeFieldProps = {
  mode: "date" | "time";
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minimumDate?: Date;
  maximumDate?: Date;
  style?: StyleProp<ViewStyle>;
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

export function DateTimeField({
  mode,
  value,
  onChange,
  placeholder,
  minimumDate,
  maximumDate,
  style,
}: DateTimeFieldProps) {
  const [showPicker, setShowPicker] = useState(false);

  const pickerValue = useMemo(() => {
    if (mode === "date") {
      return parseDateValue(value) ?? new Date();
    }

    return parseTimeValue(value) ?? new Date();
  }, [mode, value]);

  const displayValue = useMemo(() => {
    if (!value) {
      return placeholder ?? (mode === "date" ? "Select date" : "Select time");
    }

    if (mode === "date") {
      const parsed = parseDateValue(value);
      return parsed ? parsed.toLocaleDateString() : value;
    }

    const parsed = parseTimeValue(value);
    return parsed ? parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : value;
  }, [mode, placeholder, value]);

  const handleChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === "android") {
      setShowPicker(false);
    }

    if (event.type === "dismissed" || event.type === "neutralButtonPressed" || !selected) {
      return;
    }

    onChange(mode === "date" ? formatDateValue(selected) : formatTimeValue(selected));
  };

  return (
    <View style={[styles.wrap, style]}>
      <Pressable style={styles.field} onPress={() => setShowPicker((current) => (Platform.OS === "ios" ? !current : true))}>
        <Text style={styles.valueText}>{displayValue}</Text>
        <DateTimeIndicator mode={mode} />
      </Pressable>

      {showPicker ? (
        <View style={styles.pickerWrap}>
          <DateTimePicker
            mode={mode}
            value={pickerValue}
            onChange={handleChange}
            minimumDate={minimumDate}
            maximumDate={maximumDate}
            display={Platform.OS === "ios" ? (mode === "date" ? "inline" : "spinner") : "default"}
            is24Hour
          />
          {Platform.OS === "ios" ? (
            <Pressable style={styles.doneButton} onPress={() => setShowPicker(false)}>
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
          ) : null}
        </View>
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
  doneButton: {
    borderTopWidth: 1,
    borderTopColor: appTheme.colors.border,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  doneText: {
    color: appTheme.colors.primary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
  },
});
