import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  engine,
  formatSize,
  type DuplicateGroup,
  type Insights,
} from '../core';
import { useFiles } from '../store/FileStore';
import { colors, categoryColor, categoryLabel, mono, radius } from '../theme';
import Icon from '../ui/Icon';
import { Card, Chip, EmptyState, Meter, ScreenHeader } from '../ui/kit';

export default function InsightsScreen() {
  const { entries, engineInfo, removePaths } = useFiles();
  const [insights, setInsights] = useState<Insights | null>(null);
  const [dups, setDups] = useState<DuplicateGroup[]>([]);
  const [ms, setMs] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      const started = globalThis.performance?.now?.() ?? Date.now();
      const [i, d] = await Promise.all([
        engine().insights({ entries, largest_limit: 5 }),
        engine().duplicates(entries),
      ]);
      if (!alive) return;
      setInsights(i);
      setDups(d);
      setMs((globalThis.performance?.now?.() ?? Date.now()) - started);
    })();
    return () => {
      void (alive = false);
    };
  }, [entries]);

  if (!insights) {
    return (
      <View style={styles.flex}>
        <ScreenHeader title="Insights" subtitle="analysing…" />
        <EmptyState icon="chart" title="Crunching numbers" body="The Rust core is walking the index." />
      </View>
    );
  }

  const maxCat = Math.max(1, ...insights.by_category.map((c) => c.size));
  const wasted = dups.reduce((s, d) => s + d.wasted, 0);
  const reclaimable = dups.reduce((s, d) => s + d.paths.length - 1, 0);

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
      <ScreenHeader
        title="Insights"
        subtitle={`${insights.files} files · ${insights.folders} folders · ${ms.toFixed(1)} ms`}
        right={
          <View style={styles.enginePill}>
            <Icon name="cpu" size={13} color={colors.accent} />
            <Text style={styles.engineText}>RUST</Text>
          </View>
        }
      />

      <Card style={styles.hero}>
        <Text style={styles.heroLabel}>Used storage</Text>
        <Text style={styles.heroValue}>{formatSize(insights.total_size)}</Text>
        <View style={styles.heroRow}>
          <Stat label="Files" value={String(insights.files)} />
          <Stat label="Folders" value={String(insights.folders)} />
          <Stat label="Starred" value={String(insights.starred)} />
        </View>
      </Card>

      <Section title="By category">
        <Card style={{ gap: 14 }}>
          {insights.by_category.length === 0 ? (
            <Text style={styles.dim}>Nothing stored yet.</Text>
          ) : (
            insights.by_category.map((c) => (
              <View key={c.category} style={{ gap: 6 }}>
                <View style={styles.rowBetween}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={[styles.dot, { backgroundColor: categoryColor[c.category] }]} />
                    <Text style={styles.catName}>{categoryLabel[c.category] ?? c.category}</Text>
                    <Text style={styles.catCount}>{c.count}</Text>
                  </View>
                  <Text style={styles.catSize}>{formatSize(c.size)}</Text>
                </View>
                <Meter value={c.size} max={maxCat} color={categoryColor[c.category]} />
              </View>
            ))
          )}
        </Card>
      </Section>

      <Section title="Largest files">
        <Card style={{ gap: 12, paddingVertical: 8 }}>
          {insights.largest.map((f) => (
            <View key={f.path} style={styles.rowBetween}>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={styles.fileName} numberOfLines={1}>
                  {f.name}
                </Text>
                <Text style={styles.filePath} numberOfLines={1}>
                  {f.path}
                </Text>
              </View>
              <Text style={styles.fileSize}>{formatSize(f.size)}</Text>
            </View>
          ))}
        </Card>
      </Section>

      <Section
        title="Duplicates"
        right={wasted > 0 ? <Chip label={`${formatSize(wasted)} reclaimable`} tone="accent" /> : undefined}
      >
        <Card style={{ gap: 14 }}>
          {dups.length === 0 ? (
            <Text style={styles.dim}>No duplicate name+size pairs. Your storage is tidy.</Text>
          ) : (
            <>
              <Text style={styles.dim}>
                {dups.length} group{dups.length === 1 ? '' : 's'} · {reclaimable} redundant cop
                {reclaimable === 1 ? 'y' : 'ies'} detected in Rust by name + byte size.
              </Text>
              {dups.map((g) => (
                <View key={g.name + g.size} style={styles.dupRow}>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={styles.fileName} numberOfLines={1}>
                      {g.name}
                    </Text>
                    <Text style={styles.filePath} numberOfLines={2}>
                      {g.count} copies · {formatSize(g.size)} each
                    </Text>
                  </View>
                  <Pressable
                    style={styles.cleanBtn}
                    onPress={() => removePaths(g.paths.slice(1))}
                  >
                    <Icon name="trash" size={13} color={colors.warn} />
                    <Text style={styles.cleanText}>Keep 1</Text>
                  </Pressable>
                </View>
              ))}
            </>
          )}
        </Card>
      </Section>

      <Section title="Recently changed">
        <Card style={{ gap: 12, paddingVertical: 8 }}>
          {insights.newest.map((f) => (
            <View key={`new-${f.path}`} style={styles.rowBetween}>
              <Text style={styles.fileName} numberOfLines={1}>
                {f.name}
              </Text>
              <Text style={styles.filePath}>
                {new Date(f.mtime).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
              </Text>
            </View>
          ))}
        </Card>
      </Section>

      <Text style={styles.footer}>
        computed by filecore v{engineInfo.version} · native rust, jni, no js copy
      </Text>
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 3 }}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Section({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.rowBetween}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 120, gap: 22 },
  enginePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.accentDim,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.accent + '55',
  },
  engineText: { color: colors.accent, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  hero: { gap: 6, paddingVertical: 20 },
  heroLabel: { color: colors.textFaint, fontSize: 12, letterSpacing: 0.4, textTransform: 'uppercase' },
  heroValue: { color: colors.text, fontSize: 34, fontWeight: '800', letterSpacing: -1 },
  heroRow: { flexDirection: 'row', gap: 28, marginTop: 10 },
  statValue: { color: colors.text, fontSize: 17, fontWeight: '700' },
  statLabel: { color: colors.textFaint, fontSize: 11 },
  sectionTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  catName: { color: colors.text, fontSize: 13, fontWeight: '600' },
  catCount: { color: colors.textFaint, fontSize: 11, fontFamily: mono },
  catSize: { color: colors.textDim, fontSize: 12, fontFamily: mono },
  dim: { color: colors.textFaint, fontSize: 12, lineHeight: 18 },
  fileName: { color: colors.text, fontSize: 13, fontWeight: '600' },
  filePath: { color: colors.textFaint, fontSize: 11, fontFamily: mono },
  fileSize: { color: colors.textDim, fontSize: 12, fontFamily: mono },
  dupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  cleanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.warn + '18',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.warn + '55',
  },
  cleanText: { color: colors.warn, fontSize: 11.5, fontWeight: '700' },
  footer: { color: colors.textFaint, fontSize: 10.5, textAlign: 'center', fontFamily: mono },
});
