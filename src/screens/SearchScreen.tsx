import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { engine, formatSize, type Entry, type SearchResponse } from '../core';
import { dirOf } from '../fs';
import { useFiles } from '../store/FileStore';
import { colors, categoryColor, mono, radius } from '../theme';
import Icon from '../ui/Icon';
import { FileRow } from '../ui/FileRow';
import { Chip, EmptyState, ScreenHeader } from '../ui/kit';

const FILTERS: { label: string; query: string; icon?: any }[] = [
  { label: 'All', query: '' },
  { label: 'Images', query: 'type:image' },
  { label: 'Videos', query: 'type:video' },
  { label: 'Audio', query: 'type:audio' },
  { label: 'Documents', query: 'type:document' },
  { label: 'Archives', query: 'type:archive' },
  { label: 'Code', query: 'type:code' },
  { label: 'Folders', query: 'folder:true' },
  { label: 'Starred', query: 'starred:true' },
  { label: 'Big files', query: 'min:50mb' },
];

const SUGGESTIONS = ['invoice', 'jpg', 'rust', 'report', 'type:image', 'min:100mb', 'starred:true'];

export default function SearchScreen() {
  const { entries, cwd, engineInfo, setCwd, toggleStar } = useFiles();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState(0);
  const [inFolder, setInFolder] = useState(cwd !== '/');
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const reqId = useRef(0);

  const effective = useMemo(
    () => [query, FILTERS[filter].query].filter(Boolean).join(' ').trim(),
    [query, filter],
  );

  const run = useCallback(async () => {
    const id = ++reqId.current;
    setBusy(true);
    const started = globalThis.performance?.now?.() ?? Date.now();
    try {
      const res = await engine().search({
        entries,
        query: effective,
        scope: inFolder ? cwd : null,
        limit: 300,
        now: Date.now(),
      });
      const ended = globalThis.performance?.now?.() ?? Date.now();
      if (id !== reqId.current) return; // a newer keystroke won
      setResult(res);
      setElapsed(ended - started);
    } finally {
      if (id === reqId.current) setBusy(false);
    }
  }, [entries, effective, inFolder, cwd]);

  useEffect(() => {
    const t = setTimeout(run, 70);
    return () => clearTimeout(t);
  }, [run]);

  const hasQuery = effective.trim().length > 0;
  const hits = hasQuery ? result?.hits ?? [] : [];

  const openHit = (entry: Entry) => {
    const parent = dirOf(entry.path);
    setCwd(parent);
    Keyboard.dismiss();
  };

  return (
    <View style={styles.flex}>
      <ScreenHeader
        title="Search"
        subtitle={`rust · jni v${engineInfo.version} · ranked natively`}
      />

      <View style={styles.searchWrap}>
        <Icon name="search" size={17} color={colors.textFaint} />
        <TextInput
          ref={inputRef}
          value={query}
          onChangeText={setQuery}
          placeholder="Search files — try  inv  or  type:image min:1mb"
          placeholderTextColor={colors.textFaint}
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {query.length > 0 ? (
          <Pressable onPress={() => setQuery('')} hitSlop={10}>
            <Icon name="close" size={16} color={colors.textFaint} />
          </Pressable>
        ) : null}
      </View>

      <FlatList
        horizontal
        data={FILTERS}
        keyExtractor={(f) => f.label}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        renderItem={({ item, index }) => (
          <Chip
            label={item.label}
            active={filter === index}
            onPress={() => setFilter(index)}
          />
        )}
      />

      <View style={styles.statusRow}>
        <Text style={styles.status}>
          {!hasQuery
            ? 'Type to search'
            : busy && !result
              ? 'searching…'
              : `${hits.length}${result && result.total > hits.length ? ` of ${result.total}` : ''} result${hits.length === 1 ? '' : 's'}`}
          {hasQuery && result && !busy ? ` · ${elapsed < 1 ? elapsed.toFixed(2) : elapsed.toFixed(1)} ms` : ''}
        </Text>
        <Pressable onPress={() => setInFolder((v) => !v)} style={styles.scopeBtn}>
          <Icon name={inFolder ? 'folder' : 'home'} size={12} color={inFolder ? colors.accent : colors.textDim} />
          <Text style={[styles.scopeText, inFolder && { color: colors.accent }]}>
            {inFolder ? cwd : 'All storage'}
          </Text>
        </Pressable>
      </View>

      {result?.filters?.length ? (
        <View style={styles.chips}>
          {result.filters.map((f) => (
            <Text key={f} style={styles.operator}>
              {f}
            </Text>
          ))}
          <Text style={styles.operatorHint}>operator</Text>
        </View>
      ) : null}

      <FlatList
        data={hits}
        keyExtractor={(h) => h.entry.path}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.listPad}
        ListEmptyComponent={
          hasQuery ? (
            <EmptyState
              icon="search"
              title="No matches"
              body="Fuzzy matching already tolerates typos — try fewer terms, or remove a filter."
            />
          ) : (
            <View style={{ paddingHorizontal: 10, gap: 12 }}>
              <Text style={styles.hintTitle}>Try a search</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {SUGGESTIONS.map((s) => (
                  <Chip key={s} label={s} onPress={() => setQuery(s)} tone="accent" />
                ))}
              </View>
              <Text style={styles.hintBody}>
                Operators: type: , ext: , folder:true , min:50mb , starred:true — every word must
                match. Ranking runs in Rust.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <View>
            <FileRow
              entry={item.entry}
              indices={item.matched_on === 'name' ? item.indices : undefined}
              onPress={() => openHit(item.entry)}
              onStar={() => toggleStar(item.entry.path)}
              subtitle={item.matched_on === 'path' ? dirOf(item.entry.path) : undefined}
            />
            <View style={styles.hitMetaRow}>
              <Text style={[styles.hitCat, { color: categoryColor[item.category] }]}>
                {item.category}
              </Text>
              <Text style={styles.hitScore}>
                score {item.score} · {formatSize(item.entry.size)}
              </Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  input: { flex: 1, color: colors.text, fontSize: 14.5, padding: 0 },
  filterRow: { gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  status: { color: colors.textFaint, fontSize: 11.5, fontFamily: mono },
  scopeBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  scopeText: { color: colors.textDim, fontSize: 11.5, fontFamily: mono },
  chips: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingBottom: 10 },
  operator: {
    color: colors.accent,
    fontSize: 10.5,
    fontFamily: mono,
    backgroundColor: colors.accentDim,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  operatorHint: { color: colors.textFaint, fontSize: 10 },
  listPad: { paddingHorizontal: 10, paddingBottom: 110 },
  hitMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
    marginTop: -4,
  },
  hitCat: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  hitScore: { color: colors.textFaint, fontSize: 10, fontFamily: mono },
  hintTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  hintBody: { color: colors.textFaint, fontSize: 12, lineHeight: 18 },
});
