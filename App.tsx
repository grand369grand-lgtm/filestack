import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import FilesScreen from './src/screens/FilesScreen';
import InsightsScreen from './src/screens/InsightsScreen';
import SearchScreen from './src/screens/SearchScreen';
import { FileStoreProvider, useFiles } from './src/store/FileStore';
import { colors, radius } from './src/theme';
import Icon, { type IconName } from './src/ui/Icon';

type Tab = 'files' | 'search' | 'insights';

const TABS: { key: Tab; label: string; icon: IconName }[] = [
  { key: 'files', label: 'Files', icon: 'folder' },
  { key: 'search', label: 'Search', icon: 'search' },
  { key: 'insights', label: 'Insights', icon: 'chart' },
];

function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <View style={styles.tabBar}>
      {TABS.map((t) => {
        const active = tab === t.key;
        return (
          <Pressable
            key={t.key}
            onPress={() => onChange(t.key)}
            style={({ pressed }) => [styles.tab, pressed && { opacity: 0.6 }]}
          >
            <View style={[styles.tabIcon, active && styles.tabIconActive]}>
              <Icon name={t.icon} size={19} color={active ? colors.accent : colors.textFaint} />
            </View>
            <Text style={[styles.tabLabel, active && { color: colors.accent }]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Small banner shown once, so it's obvious which engine answered queries. */
function EngineBadge() {
  const { engineInfo } = useFiles();
  return (
    <View style={styles.badge}>
      <Icon name="cpu" size={11} color={colors.accent} />
      <Text style={styles.badgeText}>
        {engineInfo.engine === 'wasm' ? 'core: rust/wasm' : 'core: typescript'} · v
        {engineInfo.version}
      </Text>
    </View>
  );
}

function Shell() {
  const [tab, setTab] = useState<Tab>('files');
  const { setCwd } = useFiles();

  return (
    <View style={styles.app}>
      <View style={styles.statusGlow} pointerEvents="none" />
      <EngineBadge />
      <View style={styles.screen}>
        {tab === 'files' ? (
          <FilesScreen
            onSearchHere={(dir) => {
              setCwd(dir);
              setTab('search');
            }}
          />
        ) : null}
        {tab === 'search' ? <SearchScreen /> : null}
        {tab === 'insights' ? <InsightsScreen /> : null}
      </View>
      <TabBar tab={tab} onChange={setTab} />
    </View>
  );
}

export default function App() {
  return (
    <FileStoreProvider>
      <StatusBar style="light" />
      <Shell />
    </FileStoreProvider>
  );
}

const styles = StyleSheet.create({
  app: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingTop: Platform.OS === 'web' ? 0 : 44,
  },
  statusGlow: {
    position: 'absolute',
    top: -140,
    left: -60,
    right: -60,
    height: 260,
    backgroundColor: colors.accentDim,
    opacity: 0.35,
    borderBottomLeftRadius: 200,
    borderBottomRightRadius: 200,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surface + 'CC',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginBottom: 4,
  },
  badgeText: { color: colors.textFaint, fontSize: 10, letterSpacing: 0.3 },
  screen: { flex: 1, maxWidth: 760, width: '100%', alignSelf: 'center' },
  tabBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: Platform.OS === 'web' ? 16 : 30,
    backgroundColor: colors.surface + 'F5',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    maxWidth: 760,
    width: '100%',
    alignSelf: 'center',
  },
  tab: { alignItems: 'center', gap: 3, paddingHorizontal: 18, paddingVertical: 4 },
  tabIcon: { padding: 7, borderRadius: radius.md },
  tabIconActive: { backgroundColor: colors.accentDim },
  tabLabel: { color: colors.textFaint, fontSize: 10.5, fontWeight: '600' },
});
