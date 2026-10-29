import { Platform } from 'react-native';

export const colors = {
  bg: '#0B0F14',
  surface: '#131A22',
  surfaceAlt: '#1A232D',
  border: '#243040',
  text: '#E8EEF6',
  textDim: '#8A9AAD',
  textFaint: '#5B6B7F',
  accent: '#5EE1C0',
  accentDim: '#1E4A42',
  violet: '#8B7BFF',
  warn: '#FFB347',
  danger: '#FF6B6B',
  star: '#FFD166',
};

export const categoryColor: Record<string, string> = {
  folder: '#5EA8FF',
  image: '#5EE1C0',
  video: '#FF8B94',
  audio: '#C792EA',
  document: '#FFD166',
  sheet: '#7ED957',
  slide: '#FF9F68',
  archive: '#FFB347',
  package: '#9AA7B8',
  code: '#6FD3FF',
  other: '#8A9AAD',
};

export const categoryLabel: Record<string, string> = {
  folder: 'Folders',
  image: 'Images',
  video: 'Videos',
  audio: 'Audio',
  document: 'Documents',
  sheet: 'Spreadsheets',
  slide: 'Slides',
  archive: 'Archives',
  package: 'Packages',
  code: 'Code',
  other: 'Other',
};

export const mono = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

export const radius = { sm: 8, md: 12, lg: 18, pill: 999 };

export const spacing = (n: number) => n * 4;
