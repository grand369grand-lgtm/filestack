// Shared types for the JSON the Rust core speaks, so the UI only ever deals
// with one shape.

export type EntryKind = 'file' | 'dir';

export interface Entry {
  id: string;
  name: string;
  /** Absolute path inside the browsable root, e.g. `/Documents/a.pdf` */
  path: string;
  kind: EntryKind;
  size: number;
  /** epoch ms */
  mtime: number;
  starred?: boolean;
}

export type Category =
  | 'folder'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'sheet'
  | 'slide'
  | 'archive'
  | 'package'
  | 'code'
  | 'other';

export interface SearchHit {
  entry: Entry;
  score: number;
  matched_on: 'name' | 'path';
  /** Character indices to highlight in the name. */
  indices: number[];
  category: Category;
}

export interface SearchResponse {
  hits: SearchHit[];
  total: number;
  query_terms: string[];
  filters: string[];
}

export type SortKey = 'name' | 'size' | 'modified' | 'kind';

export interface SortRequest {
  entries: Entry[];
  key: SortKey;
  descending?: boolean;
  dirs_first?: boolean;
}

export interface CategoryStat {
  category: Category;
  count: number;
  size: number;
}

export interface Insights {
  files: number;
  folders: number;
  total_size: number;
  by_category: CategoryStat[];
  largest: Entry[];
  newest: Entry[];
  starred: number;
}

export interface DuplicateGroup {
  name: string;
  size: number;
  count: number;
  wasted: number;
  paths: string[];
}

export interface CoreApi {
  search(req: {
    entries: Entry[];
    query: string;
    scope?: string | null;
    limit?: number;
    /** epoch ms; omit to disable the recency boost (deterministic tests). */
    now?: number;
  }): Promise<SearchResponse>;
  sort(req: SortRequest): Promise<Entry[]>;
  insights(req: { entries: Entry[]; largest_limit?: number }): Promise<Insights>;
  duplicates(entries: Entry[]): Promise<DuplicateGroup[]>;
  formatSize(bytes: number): Promise<string>;
  ping(): Promise<{ ok: boolean; engine: string; version: string }>;
}
