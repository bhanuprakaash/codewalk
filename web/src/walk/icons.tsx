import type { CSSProperties } from 'react';
import { LOGOS } from './logos';

const ring = (x: number, y: number, r: number) =>
  `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

const ICONS: Record<string, string> = {
  ui: 'M2 3h12v10H2z M6 3v10 M6 7h8',
  service: 'M2.5 2.5h11V7h-11z M2.5 9h11v4.5h-11z M5 4.75h.01 M5 11.25h.01',
  package: 'M8 1.5l6 3v7l-6 3-6-3v-7z M2 4.5l6 3 6-3 M8 7.5v7',
  store: 'M2 5h12v8.5H2z M3.5 2.5h9L14 5H2z M6 8h4',
  outside: 'M4.5 12.5h7a3 3 0 0 0 .4-5.97A4 4 0 0 0 4.2 7.6a2.5 2.5 0 0 0 .3 4.9z',
  database:
    'M2.5 4c0-1.1 2.5-2 5.5-2s5.5.9 5.5 2-2.5 2-5.5 2-5.5-.9-5.5-2z M2.5 4v8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2V4 M2.5 8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2',
  key: `${ring(5, 11, 2.8)} M7 9l6.5-6.5 M11.5 4.5L13 6 M9.8 6.2l1.3 1.3`,
  agent: 'M3 5.5h10v8H3z M8 2.5v3 M6 9.5h.01 M10 9.5h.01 M1 9v2 M15 9v2',
  browser: 'M2 3h12v10H2z M2 6h12 M4 4.5h.01 M5.8 4.5h.01',
  desktop: 'M2 2.5h12v8H2z M5.5 13.5h5 M8 10.5v3',
  git: `${ring(4.5, 3.5, 1.5)} ${ring(4.5, 12.5, 1.5)} ${ring(11.5, 5, 1.5)} M4.5 5v6 M11.5 6.5c0 2.5-3 3-7 4.5`,
  queue: 'M2 4h9 M2 8h9 M2 12h9 M12.5 6l2 2-2 2',
  file: 'M4 1.5h5L12.5 5v9.5H4z M9 1.5V5h3.5',
  play: 'M5 3l8 5-8 5z',
  hand: 'M5.33 8.67V4a1 1 0 0 1 2 0v3.33M7.33 7.33V3a1 1 0 0 1 2 0v4.33M9.33 7.33V4a1 1 0 0 1 2 0v4.67c0 2.67-2 4.67-4.33 4.67S3.33 11.33 3.33 9.33V8a1 1 0 0 1 2 0',
  check: 'M3 8.5l3.2 3.2L13 4.8',
  cross: 'M4 4l8 8M12 4L4 12',
  arrow: 'M2.5 8h10M9 4.5L12.5 8 9 11.5',
  client: 'M3 3.5h10v7H3z M1.5 12.5h13',
  lb: 'M1.5 8H6 M6 8l4-4.5h4 M6 8h8 M6 8l4 4.5h4',
  cache: 'M9 1.5L3.5 9H8l-1 5.5L12.5 7H8z',
  cdn: `${ring(8, 8, 6)} M2 8h12 M8 2c-2.2 2-2.2 10 0 12 M8 2c2.2 2 2.2 10 0 12`,
  worker: `${ring(8, 8, 2.2)} M8 1.5v2 M8 12.5v2 M1.5 8h2 M12.5 8h2 M3.4 3.4l1.4 1.4 M11.2 11.2l1.4 1.4 M3.4 12.6l1.4-1.4 M11.2 4.8l1.4-1.4`,
  topic: 'M2 3.2c2-1 4-1 6 .6v10c-2-1.6-4-1.6-6-.6z M14 3.2c-2-1-4-1-6 .6v10c2-1.6 4-1.6 6-.6z',
};

const BY_KIND: Record<string, string> = {
  start: 'play',
  store: 'database',
  outside: 'si:claude',
  you: 'hand',
  output: 'check',
  exit: 'cross',
  package: 'si:go',
  db: 'database',
  external: 'outside',
};
const LETTER: Record<string, string> = { func: 'ƒ', type: 'T' };

export function BoxIcon({
  icon,
  kind,
  x,
  y,
  size,
}: {
  icon?: string;
  kind: string;
  x?: number;
  y?: number;
  size: number;
}) {
  const name = icon && (icon.startsWith('si:') || ICONS[icon]) ? icon : undefined;
  const pick = name ?? (LETTER[kind] ? undefined : (BY_KIND[kind] ?? kind));
  const logo = pick?.startsWith('si:') ? LOGOS[pick.slice(3)] : undefined;
  const style = logo && {
    '--logo': logo.hex,
    '--logo-light': logo.light,
    '--logo-dark': logo.dark,
  };
  return (
    <svg
      x={x}
      y={y}
      width={size}
      height={size}
      viewBox="0 0 36 36"
      className={`bi k-${kind}${logo ? ' logo' : ''}${icon === 'agent' ? ' agent' : ''}${kind === 'you' && !name ? ' solid' : ''}`}
      style={style as CSSProperties | undefined}
    >
      <rect className="tint" width={36} height={36} rx={10} />
      {logo ? (
        <svg x={6} y={6} width={24} height={24} viewBox="0 0 24 24">
          <path d={logo.d} fill="var(--c)" />
        </svg>
      ) : pick ? (
        <svg x={8} y={8} width={20} height={20} viewBox="0 0 16 16">
          <path
            className="ink"
            d={ICONS[pick] ?? ICONS.package}
            fill="none"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <text className="letter" x={18} y={24.5} textAnchor="middle">
          {LETTER[kind]}
        </text>
      )}
    </svg>
  );
}
