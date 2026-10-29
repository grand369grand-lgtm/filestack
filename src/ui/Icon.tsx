import React from 'react';
import Svg, { Path, Circle, Rect, Line, Polyline } from 'react-native-svg';
import { colors } from '../theme';

export type IconName =
  | 'folder'
  | 'folder-open'
  | 'file'
  | 'search'
  | 'star'
  | 'star-filled'
  | 'chart'
  | 'chevron-right'
  | 'chevron-left'
  | 'close'
  | 'sort'
  | 'grid'
  | 'list'
  | 'trash'
  | 'rename'
  | 'plus'
  | 'check'
  | 'more'
  | 'home'
  | 'cpu'
  | 'copy'
  | 'share';

interface Props {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

/** Hand-rolled stroke icons — no icon font, no network fetch. */
export default function Icon({ name, size = 20, color = colors.textDim, strokeWidth = 1.8 }: Props) {
  const s = size;
  const common = {
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none' as const,
  };
  const body = (() => {
    switch (name) {
      case 'folder':
        return <Path d="M3 7.5A2 2 0 0 1 5 5.5h3.6l1.6 2H19a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" {...common} />;
      case 'folder-open':
        return (
          <>
            <Path d="M3 8V6.5a2 2 0 0 1 2-2h3.4l1.6 2H18a2 2 0 0 1 2 2V9" {...common} />
            <Path d="M3 9h18l-2 9.2a2 2 0 0 1-2 1.6H5a2 2 0 0 1-2-1.9z" {...common} />
          </>
        );
      case 'file':
        return (
          <>
            <Path d="M13.5 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5z" {...common} />
            <Polyline points="13.5,3 13.5,8.5 19,8.5" {...common} />
          </>
        );
      case 'search':
        return (
          <>
            <Circle cx="11" cy="11" r="6.5" {...common} />
            <Line x1="16" y1="16" x2="20.5" y2="20.5" {...common} />
          </>
        );
      case 'star':
        return <Path d="M12 4l2.5 5.2 5.5.8-4 3.9.95 5.6L12 16.9 7.05 19.5 8 13.9l-4-3.9 5.5-.8z" {...common} />;
      case 'star-filled':
        return <Path d="M12 4l2.5 5.2 5.5.8-4 3.9.95 5.6L12 16.9 7.05 19.5 8 13.9l-4-3.9 5.5-.8z" {...common} fill={colors.star} stroke={colors.star} />;
      case 'chart':
        return (
          <>
            <Line x1="4" y1="20" x2="20" y2="20" {...common} />
            <Rect x="6" y="12" width="3.2" height="8" rx="1" {...common} />
            <Rect x="11" y="8" width="3.2" height="12" rx="1" {...common} />
            <Rect x="16" y="4.5" width="3.2" height="15.5" rx="1" {...common} />
          </>
        );
      case 'chevron-right':
        return <Polyline points="9.5,5.5 16,12 9.5,18.5" {...common} />;
      case 'chevron-left':
        return <Polyline points="14.5,5.5 8,12 14.5,18.5" {...common} />;
      case 'close':
        return (
          <>
            <Line x1="6" y1="6" x2="18" y2="18" {...common} />
            <Line x1="18" y1="6" x2="6" y2="18" {...common} />
          </>
        );
      case 'sort':
        return (
          <>
            <Line x1="4" y1="7" x2="14" y2="7" {...common} />
            <Line x1="4" y1="12" x2="11" y2="12" {...common} />
            <Line x1="4" y1="17" x2="8" y2="17" {...common} />
            <Polyline points="17,6 17,18" {...common} />
            <Polyline points="14,15 17,18 20,15" {...common} />
          </>
        );
      case 'grid':
        return (
          <>
            <Rect x="4" y="4" width="7" height="7" rx="1.6" {...common} />
            <Rect x="13" y="4" width="7" height="7" rx="1.6" {...common} />
            <Rect x="4" y="13" width="7" height="7" rx="1.6" {...common} />
            <Rect x="13" y="13" width="7" height="7" rx="1.6" {...common} />
          </>
        );
      case 'list':
        return (
          <>
            <Line x1="4" y1="6.5" x2="20" y2="6.5" {...common} />
            <Line x1="4" y1="12" x2="20" y2="12" {...common} />
            <Line x1="4" y1="17.5" x2="20" y2="17.5" {...common} />
          </>
        );
      case 'trash':
        return (
          <>
            <Polyline points="4,7 20,7" {...common} />
            <Path d="M9 7V5.2A1.2 1.2 0 0 1 10.2 4h3.6A1.2 1.2 0 0 1 15 5.2V7" {...common} />
            <Path d="M6 7l1 12.2A1.8 1.8 0 0 0 8.8 21h6.4a1.8 1.8 0 0 0 1.8-1.8L18 7" {...common} />
          </>
        );
      case 'rename':
        return (
          <>
            <Path d="M4 20h4L20 8l-4-4L4 16z" {...common} />
            <Line x1="14.5" y1="5.5" x2="18.5" y2="9.5" {...common} />
          </>
        );
      case 'plus':
        return (
          <>
            <Line x1="12" y1="5" x2="12" y2="19" {...common} />
            <Line x1="5" y1="12" x2="19" y2="12" {...common} />
          </>
        );
      case 'check':
        return <Polyline points="5,12.5 10,17.5 19,7" {...common} />;
      case 'more':
        return (
          <>
            <Circle cx="6" cy="12" r="1.4" fill={color} stroke="none" />
            <Circle cx="12" cy="12" r="1.4" fill={color} stroke="none" />
            <Circle cx="18" cy="12" r="1.4" fill={color} stroke="none" />
          </>
        );
      case 'home':
        return (
          <>
            <Path d="M4 11l8-6.5 8 6.5v8a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H5.5A1.5 1.5 0 0 1 4 19z" {...common} />
          </>
        );
      case 'cpu':
        return (
          <>
            <Rect x="7" y="7" width="10" height="10" rx="2" {...common} />
            <Rect x="10.5" y="10.5" width="3" height="3" rx="0.6" {...common} fill={color} stroke="none" />
            <Line x1="12" y1="3" x2="12" y2="7" {...common} />
            <Line x1="12" y1="17" x2="12" y2="21" {...common} />
            <Line x1="3" y1="12" x2="7" y2="12" {...common} />
            <Line x1="17" y1="12" x2="21" y2="12" {...common} />
          </>
        );
      case 'copy':
        return (
          <>
            <Rect x="8" y="8" width="12" height="12" rx="2" {...common} />
            <Path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" {...common} />
          </>
        );
      case 'share':
        return (
          <>
            <Circle cx="17.5" cy="6" r="2.5" {...common} />
            <Circle cx="6.5" cy="12" r="2.5" {...common} />
            <Circle cx="17.5" cy="18" r="2.5" {...common} />
            <Line x1="8.8" y1="10.8" x2="15.2" y2="7.2" {...common} />
            <Line x1="8.8" y1="13.2" x2="15.2" y2="16.8" {...common} />
          </>
        );
      default:
        return null;
    }
  })();

  return (
    <Svg width={s} height={s} viewBox="0 0 24 24">
      {body}
    </Svg>
  );
}
