import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View, ViewStyle } from "react-native";
import { appTheme } from "../ui/theme";

type SkeletonProps = {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: ViewStyle | ViewStyle[];
};

export function Skeleton({ width = "100%", height = 14, radius = 6, style }: SkeletonProps) {
  const pulse = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.5, duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[
        styles.skeleton,
        { width: width as any, height, borderRadius: radius, opacity: pulse },
        style,
      ]}
    />
  );
}

type SkeletonListProps = {
  count?: number;
  rowHeight?: number;
};

export function SkeletonList({ count = 5, rowHeight = 64 }: SkeletonListProps) {
  return (
    <View style={styles.list}>
      {Array.from({ length: count }).map((_, idx) => (
        <View key={idx} style={[styles.row, { height: rowHeight }]}>
          <Skeleton width={40} height={40} radius={20} />
          <View style={styles.rowText}>
            <Skeleton width="70%" height={14} />
            <Skeleton width="40%" height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  list: {
    gap: appTheme.spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.sm,
    backgroundColor: appTheme.colors.surface,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    borderColor: appTheme.colors.borderSoft,
    paddingHorizontal: appTheme.spacing.md,
  },
  rowText: {
    flex: 1,
    gap: 6,
  },
});
