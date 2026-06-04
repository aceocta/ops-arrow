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

const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function isSameCalendarDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// A lightweight, themed month calendar — modern and consistent across iOS/Android, replacing the
// platform's stock date dialog. Renders a month grid with prev/next navigation and min/max bounds.
function MonthCalendar({
  value,
  minimumDate,
  maximumDate,
  onSelect,
}: {
  value: Date;
  minimumDate?: Date;
  maximumDate?: Date;
  onSelect: (date: Date) => void;
}) {
  const [view, setView] = useState(() => new Date(value.getFullYear(), value.getMonth(), 1));

  const monthLabel = view.toLocaleDateString([], { month: "long", year: "numeric" });
  const firstWeekday = view.getDay();
  const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const today = new Date();
  const minDay = minimumDate
    ? new Date(minimumDate.getFullYear(), minimumDate.getMonth(), minimumDate.getDate())
    : null;
  const maxDay = maximumDate
    ? new Date(maximumDate.getFullYear(), maximumDate.getMonth(), maximumDate.getDate())
    : null;

  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstWeekday; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(new Date(view.getFullYear(), view.getMonth(), d));
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <View style={styles.calRoot}>
      <View style={styles.calHeader}>
        <Pressable
          style={styles.calNavButton}
          onPress={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
        >
          <Text style={styles.calNavText}>‹</Text>
        </Pressable>
        <Text style={styles.calMonthLabel}>{monthLabel}</Text>
        <Pressable
          style={styles.calNavButton}
          onPress={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}
          accessibilityRole="button"
          accessibilityLabel="Next month"
        >
          <Text style={styles.calNavText}>›</Text>
        </Pressable>
      </View>
      <View style={styles.calWeekRow}>
        {WEEKDAY_LABELS.map((label, i) => (
          <Text key={i} style={styles.calWeekday}>{label}</Text>
        ))}
      </View>
      <View style={styles.calGrid}>
        {cells.map((date, idx) => {
          if (!date) return <View key={`blank-${idx}`} style={styles.calCell} />;
          const selected = isSameCalendarDay(date, value);
          const isToday = !selected && isSameCalendarDay(date, today);
          const disabled = Boolean((minDay && date < minDay) || (maxDay && date > maxDay));
          return (
            <Pressable
              key={date.toISOString()}
              style={styles.calCell}
              disabled={disabled}
              onPress={() => onSelect(date)}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled }}
              accessibilityLabel={date.toDateString()}
            >
              <View
                style={[
                  styles.calDay,
                  selected ? styles.calDaySelected : null,
                  isToday ? styles.calDayToday : null,
                ]}
              >
                <Text
                  style={[
                    styles.calDayText,
                    selected ? styles.calDayTextSelected : null,
                    disabled ? styles.calDayTextDisabled : null,
                  ]}
                >
                  {date.getDate()}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
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
  // datetime is a two-step flow on both platforms: pick the date (custom calendar) then the time.
  // dtDraft holds the in-progress value between the steps.
  const [dtStage, setDtStage] = useState<"date" | "time" | null>(null);
  const [dtDraft, setDtDraft] = useState<Date | null>(null);

  const pickerValue = useMemo(() => {
    if (mode === "datetime") {
      return dtDraft ?? parseDateTimeValue(value) ?? new Date();
    }

    if (mode === "date") {
      return parseDateValue(value) ?? new Date();
    }

    return parseTimeValue(value) ?? new Date();
  }, [dtDraft, mode, value]);

  const closePicker = () => {
    setShowPicker(false);
    setDtStage(null);
    setDtDraft(null);
  };

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

  // A day was picked in the custom calendar.
  const handleCalendarSelect = (picked: Date) => {
    if (mode === "date") {
      onChange(formatDateValue(picked));
      closePicker();
      return;
    }
    // datetime: keep the picked date, carry over the current time, then move to the time step.
    const base = new Date(dtDraft ?? parseDateTimeValue(value) ?? new Date());
    base.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
    setDtDraft(base);
    setDtStage("time");
  };

  // The native time picker changed (used for `time` mode and datetime's time step).
  const handleTimeChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === "android") {
      const dismissed = event.type === "dismissed" || event.type === "neutralButtonPressed" || !selected;
      if (dismissed) {
        closePicker();
        return;
      }
      if (mode === "time") {
        onChange(formatTimeValue(selected));
        closePicker();
        return;
      }
      const base = new Date(dtDraft ?? parseDateTimeValue(value) ?? new Date());
      base.setHours(selected!.getHours(), selected!.getMinutes(), 0, 0);
      onChange(formatDateTimeValue(base));
      closePicker();
      return;
    }

    // iOS spinner updates live; the Done button commits/closes.
    if (!selected) return;
    if (mode === "time") {
      onChange(formatTimeValue(selected));
      return;
    }
    const base = new Date(dtDraft ?? parseDateTimeValue(value) ?? new Date());
    base.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
    setDtDraft(base);
  };

  // iOS Done for the time step.
  const commitIosTime = () => {
    if (mode === "datetime" && dtDraft) {
      onChange(formatDateTimeValue(dtDraft));
    }
    closePicker();
  };

  const calendarVisible = showPicker && (mode === "date" || (mode === "datetime" && dtStage === "date"));
  const timeVisible = showPicker && (mode === "time" || (mode === "datetime" && dtStage === "time"));

  return (
    <View style={[styles.wrap, style]}>
      <Pressable
        style={[styles.field, borderless ? styles.fieldBorderless : null, fieldStyle]}
        onPress={() => {
          if (mode === "datetime") {
            setDtDraft(parseDateTimeValue(value) ?? new Date());
            setDtStage("date");
            setShowPicker(true);
            return;
          }

          setShowPicker((current) => (Platform.OS === "ios" ? !current : true));
        }}
      >
        <Text style={styles.valueText}>{displayValue}</Text>
        <DateTimeIndicator mode={mode === "time" ? "time" : "date"} />
      </Pressable>

      {/* Date step — our own modern themed calendar (used for `date` and the date step of `datetime`),
          same on both platforms. Replaces Android's stock Material dialog / iOS's inline calendar. */}
      {mode === "date" || mode === "datetime" ? (
        <Modal visible={calendarVisible} transparent animationType="fade" onRequestClose={closePicker}>
          <Pressable style={styles.iosBackdrop} onPress={closePicker}>
            <Pressable style={styles.calendarCard} onPress={() => {}}>
              {mode === "datetime" ? <Text style={styles.stepLabel}>Step 1 of 2 · Date</Text> : null}
              <MonthCalendar
                value={pickerValue}
                minimumDate={minimumDate}
                maximumDate={maximumDate}
                onSelect={handleCalendarSelect}
              />
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}

      {/* Time step — Android native dialog; iOS spinner modal. Used for `time` and datetime's step 2. */}
      {Platform.OS !== "ios" && timeVisible ? (
        <DateTimePicker
          mode="time"
          value={pickerValue}
          onChange={handleTimeChange}
          themeVariant={resolvedColorScheme === "dark" ? "dark" : "light"}
          textColor={appTheme.colors.text}
          accentColor={appTheme.colors.primary}
          is24Hour
          display="default"
        />
      ) : null}

      {Platform.OS === "ios" && (mode === "time" || mode === "datetime") ? (
        <Modal visible={timeVisible} transparent animationType="fade" onRequestClose={closePicker}>
          <Pressable style={styles.iosBackdrop} onPress={closePicker}>
            <Pressable style={styles.iosPickerCard} onPress={() => {}}>
              {mode === "datetime" ? <Text style={styles.stepLabel}>Step 2 of 2 · Time</Text> : null}
              <DateTimePicker
                mode="time"
                value={pickerValue}
                onChange={handleTimeChange}
                display="spinner"
                themeVariant={resolvedColorScheme === "dark" ? "dark" : "light"}
                textColor={appTheme.colors.text}
                accentColor={appTheme.colors.primary}
                is24Hour
                style={styles.iosPicker}
              />
              <Pressable style={styles.doneButton} onPress={commitIosTime}>
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
  calendarCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: appTheme.colors.surface,
    borderRadius: appTheme.radius.md,
    padding: appTheme.spacing.md,
  },
  stepLabel: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 14,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
    textAlign: "center",
  },
  calRoot: {
    gap: 10,
  },
  calHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  calNavButton: {
    width: 36,
    height: 36,
    borderRadius: appTheme.radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  calNavText: {
    color: appTheme.colors.text,
    fontSize: 22,
    lineHeight: 24,
    marginTop: -2,
  },
  calMonthLabel: {
    flex: 1,
    textAlign: "center",
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 16,
    lineHeight: 20,
  },
  calWeekRow: {
    flexDirection: "row",
  },
  calWeekday: {
    flex: 1,
    textAlign: "center",
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 14,
  },
  calGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  calCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 2,
  },
  calDay: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  calDaySelected: {
    backgroundColor: appTheme.colors.primary,
  },
  calDayToday: {
    borderWidth: 1,
    borderColor: appTheme.colors.primary,
  },
  calDayText: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.body,
    fontSize: 14,
    lineHeight: 18,
  },
  calDayTextSelected: {
    color: appTheme.colors.onPrimary,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  calDayTextDisabled: {
    color: appTheme.colors.textSubtle,
    opacity: 0.4,
  },
});
