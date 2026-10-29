import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, mono, radius } from '../theme';
import Icon, { type IconName } from './Icon';

/* ------------------------------------------------------------------ text -- */

export function Hi({
  text,
  indices,
  style,
  highlightStyle,
  numberOfLines,
}: {
  text: string;
  indices?: number[];
  style?: any;
  highlightStyle?: any;
  numberOfLines?: number;
}) {
  if (!indices?.length) {
    return (
      <Text style={style} numberOfLines={numberOfLines}>
        {text}
      </Text>
    );
  }
  const set = new Set(indices);
  const chars = [...text];
  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {chars.map((ch, i) =>
        set.has(i) ? (
          <Text key={i} style={highlightStyle}>
            {ch}
          </Text>
        ) : (
          ch
        ),
      )}
    </Text>
  );
}

/* --------------------------------------------------------------- surfaces -- */

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Chip({
  label,
  active,
  onPress,
  icon,
  tone = 'default',
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  icon?: IconName;
  tone?: 'default' | 'accent';
}) {
  const dim = tone === 'accent' ? colors.accent : colors.textDim;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        active && { backgroundColor: colors.accentDim, borderColor: colors.accent },
        pressed && { opacity: 0.7 },
      ]}
    >
      {icon ? (
        <Icon name={icon} size={13} color={active ? colors.accent : dim} strokeWidth={2} />
      ) : null}
      <Text style={[styles.chipText, active && { color: colors.accent }]}>{label}</Text>
    </Pressable>
  );
}

export function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.badge, { borderColor: color + '55', backgroundColor: color + '18' }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

export function ScreenHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <Text style={styles.headerTitle}>{title}</Text>
        {subtitle ? (
          <Text style={styles.headerSub} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

export function IconButton({
  name,
  onPress,
  color = colors.textDim,
  size = 20,
  active,
  badge,
}: {
  name: IconName;
  onPress?: () => void;
  color?: string;
  size?: number;
  active?: boolean;
  badge?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        styles.iconBtn,
        active && { backgroundColor: colors.accentDim, borderColor: colors.accent + '66' },
        pressed && { opacity: 0.6 },
      ]}
    >
      <Icon name={name} size={size} color={active ? colors.accent : color} />
      {badge ? <View style={styles.dot} /> : null}
    </Pressable>
  );
}

export function EmptyState({
  icon = 'folder-open',
  title,
  body,
}: {
  icon?: IconName;
  title: string;
  body?: string;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Icon name={icon} size={28} color={colors.textFaint} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {body ? <Text style={styles.emptyBody}>{body}</Text> : null}
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

/** Horizontal meter used on the insights screen. */
export function Meter({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <View style={styles.meterTrack}>
      <View style={[styles.meterFill, { width: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 16,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipText: { color: colors.textDim, fontSize: 12, fontWeight: '600' },
  badge: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'web' ? 18 : 8,
    paddingBottom: 14,
  },
  headerTitle: { color: colors.text, fontSize: 26, fontWeight: '700', letterSpacing: -0.5 },
  headerSub: { color: colors.textFaint, fontSize: 12, marginTop: 3, fontFamily: mono },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  dot: {
    position: 'absolute',
    top: 7,
    right: 8,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyIcon: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
  emptyBody: { color: colors.textFaint, fontSize: 12.5, textAlign: 'center', maxWidth: 260 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  meterTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  meterFill: { height: 6, borderRadius: 3 },
});
