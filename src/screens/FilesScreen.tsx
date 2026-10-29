import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { categoryOf, formatSize, type Entry, type SortKey } from '../core';
import { fs, joinPath } from '../fs';
import { useFiles } from '../store/FileStore';
import { colors, categoryLabel, mono, radius } from '../theme';
import Icon from '../ui/Icon';
import { FileRow, FileTile } from '../ui/FileRow';
import { Card, Chip, EmptyState, IconButton, ScreenHeader } from '../ui/kit';
import { Prompt, Sheet } from '../ui/Prompt';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'size', label: 'Size' },
  { key: 'modified', label: 'Modified' },
  { key: 'kind', label: 'Type' },
];

export default function FilesScreen({ onSearchHere }: { onSearchHere: (dir: string) => void }) {
  const {
    cwd, setCwd, breadcrumbs, sortedChildren, loading, engineInfo,
    sortKey, sortDesc, dirsFirst, setDirsFirst, setSort, viewMode, setViewMode,
    selection, isSelecting, toggleSelect, clearSelection, selectAll,
    createFolder, removePaths, renamePath, importFiles, toggleStar, refresh,
  } = useFiles();

  const [newFolder, setNewFolder] = useState(false);
  const [renaming, setRenaming] = useState<Entry | null>(null);
  const [preview, setPreview] = useState<{ entry: Entry; text: string | null } | null>(null);
  const [sortOpen, setSortOpen] = useState(false);

  const open = async (entry: Entry) => {
    if (isSelecting) {
      toggleSelect(entry.path);
      return;
    }
    if (entry.kind === 'dir') {
      setCwd(entry.path);
      return;
    }
    setPreview({ entry, text: null });
    try {
      const text = await fs.readText(entry.path);
      setPreview({ entry, text });
    } catch (e) {
      setPreview({ entry, text: e instanceof Error ? `(${e.message})` : '(no preview)' });
    }
  };

  const currentPath = cwd === '/' ? 'Home' : cwd;

  return (
    <View style={styles.flex}>
      <ScreenHeader
        title="Files"
        subtitle={`${engineInfo.engine === 'wasm' ? 'rust · wasm' : 'js engine'} · ${sortedChildren.length} items`}
        right={
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <IconButton
              name={viewMode === 'list' ? 'grid' : 'list'}
              onPress={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}
            />
            <IconButton name="sort" onPress={() => setSortOpen(true)} active />
          </View>
        }
      />

      {/* breadcrumbs */}
      <View style={styles.crumbBar}>
        {cwd !== '/' ? (
          <Pressable onPress={() => setCwd('/')} hitSlop={8} style={styles.homeBtn}>
            <Icon name="home" size={15} color={colors.textDim} />
          </Pressable>
        ) : null}
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={breadcrumbs}
          keyExtractor={(c) => c.path}
          contentContainerStyle={{ alignItems: 'center', gap: 2 }}
          renderItem={({ item, index }) => (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {index > 0 ? <Icon name="chevron-right" size={13} color={colors.textFaint} /> : null}
              <Pressable onPress={() => setCwd(item.path)}>
                <Text
                  style={[
                    styles.crumb,
                    index === breadcrumbs.length - 1 && { color: colors.text, fontWeight: '700' },
                  ]}
                >
                  {item.name}
                </Text>
              </Pressable>
            </View>
          )}
        />
        <Pressable onPress={() => onSearchHere(cwd)} hitSlop={8} style={styles.homeBtn}>
          <Icon name="search" size={15} color={colors.accent} />
        </Pressable>
      </View>

      {isSelecting ? (
        <View style={styles.selectionBar}>
          <Text style={styles.selCount}>{selection.length} selected</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <IconButton name="check" onPress={selectAll} size={17} />
            <IconButton
              name="rename"
              size={17}
              onPress={() => {
                const target = sortedChildren.find((e) => e.path === selection[0]);
                if (target) setRenaming(target);
              }}
            />
            <IconButton
              name="trash"
              size={17}
              color={colors.danger}
              onPress={() => removePaths(selection)}
            />
            <IconButton name="close" size={17} onPress={clearSelection} />
          </View>
        </View>
      ) : null}

      {viewMode === 'list' ? (
        <FlatList
          data={sortedChildren}
          keyExtractor={(e) => e.path}
          contentContainerStyle={styles.listPad}
          refreshing={loading}
          onRefresh={refresh}
          ListEmptyComponent={
            <EmptyState
              title={loading ? 'Reading storage…' : 'This folder is empty'}
              body="Create a folder or import files to get started."
            />
          }
          renderItem={({ item }) => (
            <FileRow
              entry={item}
              selecting={isSelecting}
              selected={selection.includes(item.path)}
              onPress={() => open(item)}
              onLongPress={() => toggleSelect(item.path)}
              onStar={() => toggleStar(item.path)}
            />
          )}
        />
      ) : (
        <FlatList
          data={sortedChildren}
          key="grid"
          numColumns={2}
          keyExtractor={(e) => e.path}
          columnWrapperStyle={{ gap: 10 }}
          contentContainerStyle={[styles.listPad, { gap: 10 }]}
          ListEmptyComponent={<EmptyState title={loading ? 'Reading storage…' : 'Empty folder'} />}
          renderItem={({ item }) => (
            <FileTile
              entry={item}
              selected={selection.includes(item.path)}
              onPress={() => open(item)}
              onLongPress={() => toggleSelect(item.path)}
            />
          )}
        />
      )}

      {/* action bar */}
      <View style={styles.actionBar}>
        <Pressable style={styles.action} onPress={() => setNewFolder(true)}>
          <Icon name="plus" size={17} color={colors.accent} />
          <Text style={styles.actionText}>New folder</Text>
        </Pressable>
        <Pressable style={styles.action} onPress={importFiles}>
          <Icon name="copy" size={17} color={colors.textDim} />
          <Text style={[styles.actionText, { color: colors.textDim }]}>Import</Text>
        </Pressable>
        <Text style={styles.engineTag} numberOfLines={1}>
          {currentPath}
        </Text>
      </View>

      <Sheet visible={sortOpen} onClose={() => setSortOpen(false)} title="Sort by">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {SORTS.map((s) => (
            <Chip
              key={s.key}
              label={
                sortKey === s.key ? `${s.label} ${sortDesc ? '↓' : '↑'}` : s.label
              }
              active={sortKey === s.key}
              onPress={() => setSort(s.key)}
            />
          ))}
          <Chip
            label="Folders first"
            active={dirsFirst}
            icon="folder"
            onPress={() => setDirsFirst(!dirsFirst)}
          />
        </View>
      </Sheet>

      <Sheet
        visible={!!preview}
        onClose={() => setPreview(null)}
        title={preview?.entry.name}
      >
        {preview ? (
          <View style={{ gap: 14 }}>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <Chip label={categoryLabel[categoryOf(preview.entry)] ?? 'File'} />
              <Chip label={formatSize(preview.entry.size)} />
              <Chip
                label={new Date(preview.entry.mtime).toLocaleString(undefined, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              />
            </View>
            <Card style={{ maxHeight: 320, padding: 14 }}>
              <Text style={styles.previewText}>
                {preview.text ?? 'Loading…'}
              </Text>
            </Card>
            <Text style={styles.previewPath}>
              {preview.entry.path} · {joinPath(cwd, preview.entry.name)}
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                style={[styles.sheetBtn, { borderColor: colors.danger + '66' }]}
                onPress={() => {
                  removePaths([preview.entry.path]);
                  setPreview(null);
                }}
              >
                <Icon name="trash" size={15} color={colors.danger} />
                <Text style={[styles.sheetBtnText, { color: colors.danger }]}>Delete</Text>
              </Pressable>
              <Pressable
                style={styles.sheetBtn}
                onPress={() => {
                  setRenaming(preview.entry);
                  setPreview(null);
                }}
              >
                <Icon name="rename" size={15} color={colors.textDim} />
                <Text style={styles.sheetBtnText}>Rename</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </Sheet>

      <FolderPrompt
        visible={newFolder}
        onClose={() => setNewFolder(false)}
        onSubmit={(name) => {
          setNewFolder(false);
          createFolder(name);
        }}
      />
      <RenamePrompt
        entry={renaming}
        onClose={() => setRenaming(null)}
        onSubmit={(name) => {
          if (renaming) renamePath(renaming.path, name);
          setRenaming(null);
        }}
      />
    </View>
  );
}

function FolderPrompt({
  visible,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (name: string) => void;
}) {
  return (
    <Prompt
      visible={visible}
      title="New folder"
      placeholder="Folder name"
      confirmLabel="Create"
      onCancel={onClose}
      onConfirm={onSubmit}
    />
  );
}

function RenamePrompt({
  entry,
  onClose,
  onSubmit,
}: {
  entry: Entry | null;
  onClose: () => void;
  onSubmit: (name: string) => void;
}) {
  return (
    <Prompt
      visible={!!entry}
      title="Rename"
      placeholder="New name"
      initialValue={entry?.name ?? ''}
      confirmLabel="Rename"
      onCancel={onClose}
      onConfirm={onSubmit}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  crumbBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  crumb: { color: colors.textDim, fontSize: 13, paddingHorizontal: 4, fontFamily: mono },
  homeBtn: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  selectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 14,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.accent + '44',
  },
  selCount: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  listPad: { paddingHorizontal: 10, paddingBottom: 120 },
  actionBar: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface + 'F2',
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  actionText: { color: colors.accent, fontSize: 12.5, fontWeight: '700' },
  engineTag: { flex: 1, textAlign: 'right', color: colors.textFaint, fontSize: 10.5, fontFamily: mono },
  previewText: { color: colors.text, fontSize: 12.5, fontFamily: mono, lineHeight: 19 },
  previewPath: { color: colors.textFaint, fontSize: 11, fontFamily: mono },
  sheetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  sheetBtnText: { color: colors.textDim, fontSize: 13, fontWeight: '600' },
});
