import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Alert } from 'react-native';
import { engine, initCore, engineInfo, type EngineInfo, type Entry, type SortKey } from '../core';
import { fs, childrenOf } from '../fs';

export type ViewMode = 'list' | 'grid';

interface FileStoreValue {
  entries: Entry[];
  loading: boolean;
  error: string | null;
  engineInfo: EngineInfo;

  cwd: string;
  setCwd: (path: string) => void;
  breadcrumbs: { name: string; path: string }[];
  children: Entry[];
  sortedChildren: Entry[];

  sortKey: SortKey;
  sortDesc: boolean;
  dirsFirst: boolean;
  setDirsFirst: (value: boolean) => void;
  setSort: (key: SortKey, desc?: boolean) => void;

  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;

  selection: string[];
  isSelecting: boolean;
  toggleSelect: (path: string) => void;
  clearSelection: () => void;
  selectAll: () => void;

  refresh: () => Promise<void>;
  createFolder: (name: string) => Promise<void>;
  removePaths: (paths: string[]) => Promise<void>;
  renamePath: (path: string, nextName: string) => Promise<void>;
  importFiles: () => Promise<void>;
  toggleStar: (path: string) => void;
  sortWithRust: (key: SortKey, desc: boolean) => Promise<Entry[]>;
}

const Ctx = createContext<FileStoreValue | null>(null);

export function FileStoreProvider({ children: node }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cwd, setCwd] = useState('/');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDesc, setSortDesc] = useState(false);
  const [dirsFirst, setDirsFirst] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selection, setSelection] = useState<string[]>([]);
  const [stars, setStars] = useState<Record<string, boolean>>({});
  const [info, setInfo] = useState<EngineInfo>({ engine: 'js', version: '0.1.0' });

  const mounted = useRef(true);
  useEffect(() => {
    // Reset on every effect setup so React Strict Mode's development-only
    // setup/cleanup/setup cycle still lets the second async scan commit.
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const applyStars = useCallback(
    (list: Entry[], starMap: Record<string, boolean>) =>
      list.map((e) => {
        const saved = starMap[e.path];
        return saved === undefined || e.starred === saved ? e : { ...e, starred: saved };
      }),
    [],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fs.scan();
      if (mounted.current) setEntries(applyStars(list, stars));
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [applyStars, stars]);

  useEffect(() => {
    (async () => {
      const engineMeta = await initCore();
      if (mounted.current) setInfo(engineMeta);
      await refresh();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const children = useMemo(() => childrenOf(entries, cwd), [entries, cwd]);
  const [sortedChildren, setSortedChildren] = useState<Entry[]>([]);

  // The Rust core owns ordering just like it owns search ranking. On native,
  // the exact same API falls back to the parity-tested TypeScript mirror.
  useEffect(() => {
    let cancelled = false;
    engine()
      .sort({
        entries: children,
        key: sortKey,
        descending: sortDesc,
        dirs_first: dirsFirst,
      })
      .then((sorted) => {
        if (!cancelled) setSortedChildren(sorted);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [children, sortKey, sortDesc, dirsFirst, info.engine]);

  const breadcrumbs = useMemo(() => {
    const parts = cwd.split('/').filter(Boolean);
    const crumbs = [{ name: 'Home', path: '/' }];
    let acc = '';
    for (const p of parts) {
      acc += `/${p}`;
      crumbs.push({ name: p, path: acc });
    }
    return crumbs;
  }, [cwd]);

  const sortWithRust = useCallback(async (key: SortKey, desc: boolean) => {
    return engine().sort({ entries: childrenOf(entries, cwd), key, descending: desc, dirs_first: dirsFirst });
  }, [entries, cwd, dirsFirst]);

  const createFolder = useCallback(
    async (name: string) => {
      const clean = name.trim();
      if (!clean) return;
      try {
        await fs.mkdir(cwd, clean);
        await refresh();
      } catch (e) {
        Alert.alert('Could not create folder', e instanceof Error ? e.message : String(e));
      }
    },
    [cwd, refresh],
  );

  const removePaths = useCallback(
    async (paths: string[]) => {
      try {
        await fs.remove(paths);
        setSelection([]);
        await refresh();
      } catch (e) {
        Alert.alert('Delete failed', e instanceof Error ? e.message : String(e));
      }
    },
    [refresh],
  );

  const renamePath = useCallback(
    async (path: string, nextName: string) => {
      try {
        await fs.rename(path, nextName.trim());
        setSelection([]);
        await refresh();
      } catch (e) {
        Alert.alert('Rename failed', e instanceof Error ? e.message : String(e));
      }
    },
    [refresh],
  );

  const importFiles = useCallback(async () => {
    try {
      const added = await fs.importFiles();
      if (added.length) await refresh();
    } catch (e) {
      Alert.alert('Import failed', e instanceof Error ? e.message : String(e));
    }
  }, [refresh]);

  const toggleStar = useCallback((path: string) => {
    setStars((prev) => {
      const current = prev[path] ?? entries.find((e) => e.path === path)?.starred ?? false;
      const next = { ...prev, [path]: !current };
      setEntries((list) => list.map((e) => (e.path === path ? { ...e, starred: next[path] } : e)));
      return next;
    });
  }, [entries]);

  const toggleSelect = useCallback((path: string) => {
    setSelection((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path],
    );
  }, []);

  const value: FileStoreValue = {
    entries,
    loading,
    error,
    engineInfo: info,
    cwd,
    setCwd: (p) => {
      setCwd(p);
      setSelection([]);
    },
    breadcrumbs,
    children,
    sortedChildren,
    sortKey,
    sortDesc,
    dirsFirst,
    setDirsFirst,
    setSort: (key, desc) => {
      setSortKey(key);
      setSortDesc(desc ?? (key === sortKey ? !sortDesc : false));
    },
    viewMode,
    setViewMode,
    selection,
    isSelecting: selection.length > 0,
    toggleSelect,
    clearSelection: () => setSelection([]),
    selectAll: () => setSelection(childrenOf(entries, cwd).map((e) => e.path)),
    refresh,
    createFolder,
    removePaths,
    renamePath,
    importFiles,
    toggleStar,
    sortWithRust,
  };

  return <Ctx.Provider value={value}>{node}</Ctx.Provider>;
}

export function useFiles(): FileStoreValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useFiles must be used inside <FileStoreProvider>');
  return v;
}

export { engineInfo };
