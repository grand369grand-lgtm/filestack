import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { categoryOf, formatSize, type Entry } from '../core';
import { colors, categoryColor, radius } from '../theme';
import Icon from './Icon';
import { Hi } from './kit';

const dateLabel = (ms: number): string => {
  if (!ms) return '—';
  const d = new Date(ms);
  const diff = Date.now() - ms;
  if (diff < 86_400_000) return 'Today';
  if (diff < 2 * 86_400_000) return 'Yesterday';
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

export function FileRow({
  entry,
  onPress,
  onLongPress,
  selected,
  selecting,
  indices,
  onStar,
  subtitle,
}: {
  entry: Entry;
  onPress?: () => void;
  onLongPress?: () => void;
  selected?: boolean;
  selecting?: boolean;
  indices?: number[];
  onStar?: () => void;
  subtitle?: string;
}) {
  const cat = categoryOf(entry);
  const tint = categoryColor[cat] ?? colors.textDim;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={220}
      style={({ pressed }) => [
        styles.row,
        selected && { backgroundColor: colors.accentDim + '99', borderColor: colors.accent + '55' },
        pressed && { backgroundColor: colors.surfaceAlt },
      ]}
    >
      {selecting ? (
        <View style={[styles.check, selected && styles.checkOn]}>
          {selected ? <Icon name="check" size={13} color={colors.bg} strokeWidth={2.6} /> : null}
        </View>
      ) : null}

      <View style={[styles.tile, { backgroundColor: tint + '1A', borderColor: tint + '33' }]}>
        <Icon name={entry.kind === 'dir' ? 'folder' : 'file'} size={19} color={tint} />
      </View>

      <View style={styles.body}>
        <Hi
          text={entry.name}
          indices={indices}
          numberOfLines={1}
          style={styles.name}
          highlightStyle={styles.hl}
        />
        <Text style={styles.meta} numberOfLines={1}>
          {entry.kind === 'dir' ? 'Folder' : formatSize(entry.size)}
          {'  ·  '}
          {dateLabel(entry.mtime)}
          {subtitle ? `  ·  ${subtitle}` : ''}
        </Text>
      </View>

      {onStar ? (
        <Pressable onPress={onStar} hitSlop={10} style={styles.star}>
          <Icon name={entry.starred ? 'star-filled' : 'star'} size={17} color={entry.starred ? colors.star : colors.textFaint} />
        </Pressable>
      ) : null}
      {entry.kind === 'dir' ? <Icon name="chevron-right" size={16} color={colors.textFaint} /> : null}
    </Pressable>
  );
}

export function FileTile({
  entry,
  onPress,
  onLongPress,
  selected,
}: {
  entry: Entry;
  onPress?: () => void;
  onLongPress?: () => void;
  selected?: boolean;
}) {
  const cat = categoryOf(entry);
  const tint = categoryColor[cat] ?? colors.textDim;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={220}
      style={({ pressed }) => [
        styles.tileCard,
        selected && { borderColor: colors.accent, backgroundColor: colors.accentDim + '66' },
        pressed && { backgroundColor: colors.surfaceAlt },
      ]}
    >
      <View style={[styles.tileIcon, { backgroundColor: tint + '18' }]}>
        <Icon name={entry.kind === 'dir' ? 'folder' : 'file'} size={26} color={tint} />
      </View>
      <Text style={styles.tileName} numberOfLines={2}>
        {entry.name}
      </Text>
      <Text style={styles.tileMeta}>
        {entry.kind === 'dir' ? 'Folder' : formatSize(entry.size)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  check: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  tile: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  body: { flex: 1, gap: 3 },
  name: { color: colors.text, fontSize: 14.5, fontWeight: '600' },
  hl: { color: colors.bg, backgroundColor: colors.accent, fontWeight: '700' },
  meta: { color: colors.textFaint, fontSize: 11.5 },
  star: { padding: 4 },
  tileCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 12,
    gap: 8,
  },
  tileIcon: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileName: { color: colors.text, fontSize: 12.5, fontWeight: '600' },
  tileMeta: { color: colors.textFaint, fontSize: 10.5 },
});
