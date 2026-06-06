import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { getBusinessDayStaff } from "../../api/rotaApi";
import { StatusBadge } from "../../components/StatusBadge";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

function statusLabel(status: string) {
  switch (status) {
    case "OnShift": return "On shift";
    case "Completed": return "Done";
    case "Unplanned": return "Unplanned";
    default: return "Scheduled";
  }
}

function statusTone(status: string): "neutral" | "warning" | "danger" | "success" {
  switch (status) {
    case "OnShift": return "success";
    case "Unplanned": return "warning";
    default: return "neutral";
  }
}

const hhmm = (t?: string | null) => (t ? t.slice(0, 5) : "");
const clock = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "";

/** "Staff on shift" card for a business day — rostered staff + their clocked hours. Renders nothing
 *  when there's no staff data for the date. Used on the business-day and day-close screens. */
export function BusinessDayStaffCard({ shopId, date }: { shopId: string; date: string }) {
  const staffQuery = useQuery({
    queryKey: ["rota-day-staff", shopId, date],
    queryFn: () => getBusinessDayStaff(shopId, date),
    enabled: Boolean(shopId),
  });

  const data = staffQuery.data;
  if (!data || data.rows.length === 0) return null;

  return (
    <View style={ui.card}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Staff on shift</Text>
        <Text style={styles.meta}>{data.totalHours.toFixed(1)} h worked</Text>
      </View>
      {data.rows.map((row) => (
        <View key={row.userId} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>{row.userName}</Text>
            <Text style={styles.meta} numberOfLines={1}>
              {row.shiftName ? `${row.shiftName} · ` : ""}
              {row.startTime ? `${hhmm(row.startTime)}–${hhmm(row.endTime)}` : "Not rostered"}
              {row.checkInAt ? `  ·  in ${clock(row.checkInAt)}` : ""}
              {row.checkOutAt ? ` – out ${clock(row.checkOutAt)}` : ""}
            </Text>
          </View>
          {row.hours > 0 ? <Text style={styles.hours}>{row.hours.toFixed(1)}h</Text> : null}
          <StatusBadge label={statusLabel(row.status)} tone={statusTone(row.status)} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: appTheme.spacing.sm },
  sectionTitle: { fontSize: 17, lineHeight: 22, fontFamily: appTheme.fonts.bodyMedium, color: appTheme.colors.text },
  meta: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, lineHeight: 18, fontSize: 13 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.sm,
    paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: appTheme.colors.borderSoft,
  },
  name: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14, lineHeight: 18 },
  hours: { color: appTheme.colors.text, fontFamily: appTheme.fonts.heading, fontSize: 14 },
});
