import { kc } from './graph';
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
};

export function BoxIcon({
  icon,
  kind,
  x,
  y,
  size,
}: {
  icon: string;
  kind: string;
  x: number;
  y: number;
  size: number;
}) {
  const logo = icon.startsWith('si:') ? LOGOS[icon.slice(3)] : undefined;
  if (logo)
    return (
      <svg x={x} y={y} width={size} height={size} viewBox="0 0 24 24">
        <path d={logo} fill="var(--text)" />
      </svg>
    );
  return (
    <svg x={x} y={y} width={size} height={size} viewBox="0 0 16 16">
      <path
        d={ICONS[icon] ?? ICONS[kind] ?? ICONS.package}
        fill="none"
        stroke={kc(kind)}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
