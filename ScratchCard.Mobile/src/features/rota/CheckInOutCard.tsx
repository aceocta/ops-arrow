import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { checkInShift, checkOutShift, getMyCurrentAttendance } from "../../api/rotaApi";
import { toastError } from "../../components/toast";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

const clockTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "";

// Elapsed time since check-in as "5h 24m" (or "24m" when under an hour).
function elapsedLabel(fromIso: string, nowMs: number) {
  const mins = Math.max(0, Math.round((nowMs - new Date(fromIso).getTime()) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/**
 * Home-screen quick attendance card: lets staff clock in / out with one tap without
 * navigating into My Shifts. Check-in resolves today's assigned shift server-side, so
 * no shift needs to be picked here.
 */
export function CheckInOutCard({ shopId }: { shopId: string }) {
  const queryClient = useQueryClient();
  const attendanceQuery = useQuery({
    queryKey: ["rota-attendance", shopId],
    queryFn: () => getMyCurrentAttendance(shopId),
    enabled: Boolean(shopId),
  });

  const current = attendanceQuery.data;
  const onShift = Boolean(current && !current.checkOutAt);

  // Tick once a minute so the "on shift for" label stays current while checked in.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!onShift) return;
    const id = setInterval(() => setNowMs(Date.now()), 60000);
    return () => clearInterval(id);
  }, [onShift]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["rota-attendance", shopId] });
    void queryClient.invalidateQueries({ queryKey: ["rota-my-shifts", shopId] });
  };

  const checkInMutation = useMutation({
    mutationFn: () => checkInShift(shopId),
    onSuccess: refresh,
    onError: (error: any) => toastError(error?.response?.data?.message ?? "Couldn't check in."),
  });
  const checkOutMutation = useMutation({
    mutationFn: () => checkOutShift(shopId),
    onSuccess: refresh,
    onError: (error: any) => toastError(error?.response?.data?.message ?? "Couldn't check out."),
  });

  const busy = checkInMutation.isPending || checkOutMutation.isPending;

  return (
    <View style={[ui.card, styles.card, onShift ? styles.cardOnShift : null]}>
      <View style={[styles.iconWrap, onShift ? styles.iconWrapOnShift : null]}>
        <Ionicons
          name={onShift ? "time" : "time-outline"}
          size={22}
          color={onShift ? appTheme.colors.success : appTheme.colors.info}
        />
      </View>

      <View style={styles.textWrap}>
        {attendanceQuery.isLoading ? (
          <Text style={styles.status}>Checking attendance…</Text>
        ) : onShift ? (
          <>
            <Text style={styles.status}>On shift</Text>
            <Text style={styles.meta}>
              Since {clockTime(current!.checkInAt)} · {elapsedLabel(current!.checkInAt, nowMs)}
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.status}>Not on shift</Text>
            <Text style={styles.meta}>Tap to clock in for today</Text>
          </>
        )}
      </View>

      {attendanceQuery.isLoading ? (
        <ActivityIndicator size="small" color={appTheme.colors.primary} />
      ) : (
        <Pressable
          style={({ pressed }) => [
            styles.actBtn,
            onShift ? styles.actBtnOut : styles.actBtnIn,
            pressed && styles.actBtnPressed,
            busy && styles.actBtnBusy,
          ]}
          onPress={() => (onShift ? checkOutMutation.mutate() : checkInMutation.mutate())}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={onShift ? "Check out" : "Check in"}
        >
          <Ionicons
            name={onShift ? "log-out-outline" : "log-in-outline"}
            size={16}
            color="#FFFFFF"
          />
          <Text style={styles.actBtnText}>
            {busy
              ? onShift
                ? "Checking out…"
                : "Checking in…"
              : onShift
              ? "Check out"
              : "Check in"}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  cardOnShift: {
    borderWidth: 1,
    borderColor: appTheme.colors.borderSuccessSoft,
    backgroundColor: appTheme.colors.surfaceSuccessSoft,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: appTheme.radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: appTheme.colors.surfaceInfoMuted,
  },
  iconWrapOnShift: {
    backgroundColor: appTheme.colors.surfaceSuccessMuted,
  },
  textWrap: { flex: 1, gap: 2 },
  status: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 15 },
  meta: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 13 },
  actBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: appTheme.radius.pill,
  },
  actBtnIn: { backgroundColor: appTheme.colors.primary },
  actBtnOut: { backgroundColor: appTheme.colors.success },
  actBtnPressed: { opacity: 0.85 },
  actBtnBusy: { opacity: 0.6 },
  actBtnText: { color: "#FFFFFF", fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
});
