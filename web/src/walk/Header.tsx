import { useEffect, useRef, useState, type ReactNode } from 'react';
import { hrefOf, parentOf, useNav, type Route } from '../route';
import { toggleTheme } from '../theme';

const Svg = ({
  d,
  size = 16,
  sw = 2,
  fill = 'none',
}: {
  d: string;
  size?: number;
  sw?: number;
  fill?: string;
}) => (
  <svg
    aria-hidden="true"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={fill}
    stroke="currentColor"
    strokeWidth={sw}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d={d} />
  </svg>
);

const GRID = 'M3 3h7v7H3z M14 3h7v7h-7z M8.5 14h7v7h-7z';
const MOON = 'M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z';
const SUN =
  'M12 8a4 4 0 100 8 4 4 0 000-8z M12 2v2 M12 20v2 M2 12h2 M20 12h2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4';
const CHEVRON = 'M6 9l6 6 6-6';
const HAND =
  'M8 13V6a1.5 1.5 0 013 0v5M11 11V4.5a1.5 1.5 0 013 0V11M14 11V6a1.5 1.5 0 013 0v7c0 4-3 7-6.5 7S5 17 5 14v-2a1.5 1.5 0 013 0';
const ARROW = 'M4 12h14M13 6l6 6-6 6';

type Item = { label: string; to: Route; on?: boolean };
type Group = { title?: string; items: Item[] };

function Picker({ label, groups }: { label: ReactNode; groups: Group[] }) {
  const { go } = useNav();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => box.current?.contains(e.target as Node) || setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    addEventListener('pointerdown', away);
    addEventListener('keydown', esc);
    return () => {
      removeEventListener('pointerdown', away);
      removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div className="pick" ref={box}>
      <button
        className="pill"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {label}
        <Svg d={CHEVRON} />
      </button>
      {open && (
        <div className="menu" role="menu">
          {groups.map((g, i) => (
            <div key={i}>
              {g.title && <div className="mh">{g.title}</div>}
              {g.items.map((it) => (
                <a
                  key={it.label}
                  role="menuitem"
                  href={hrefOf(it.to)}
                  className={it.on ? 'on' : ''}
                  onClick={(e) => {
                    e.preventDefault();
                    setOpen(false);
                    go(it.to);
                  }}
                >
                  {it.label}
                </a>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function TopBar({
  name,
  viewLabel,
  views,
  children,
}: {
  name?: string;
  viewLabel?: string;
  views?: Item[];
  children?: ReactNode;
}) {
  const { projects, route, go } = useNav();
  const up = parentOf(route);
  const title = name ?? route.scope;
  return (
    <header>
      <button
        className="icon-btn"
        title="Light / dark"
        aria-label="Light / dark"
        onClick={toggleTheme}
      >
        <span className="moon">
          <Svg d={MOON} size={20} sw={1.8} />
        </span>
        <span className="sun">
          <Svg d={SUN} size={20} sw={1.8} />
        </span>
      </button>
      <div className="mark">
        <span aria-hidden="true">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <circle cx="5" cy="12" r="2.2" />
            <circle cx="19" cy="6" r="2.2" />
            <circle cx="19" cy="18" r="2.2" />
            <path d="M7 11l10-4M7 13l10 4" />
          </svg>
        </span>
        <b>codewalk</b>
      </div>
      <span className="vsep" aria-hidden="true" />
      <button className="round" aria-label="Back" disabled={!up} onClick={() => up && go(up)}>
        <Svg d="M19 12H5M11 6l-6 6 6 6" size={18} />
      </button>
      <Picker
        label={
          route.project ? (
            <>
              {route.project}
              {title && (
                <>
                  {' · '}
                  <b>{title}</b>
                </>
              )}
            </>
          ) : (
            'Pick a project'
          )
        }
        groups={(projects ?? []).map((p) => ({
          title: p.name,
          items: [
            {
              label: 'System',
              to: { project: p.name },
              on: route.project === p.name && !route.scope,
            },
            ...p.scopes.map((scope) => ({
              label: scope,
              to: { project: p.name, scope },
              on: route.project === p.name && route.scope === scope,
            })),
          ],
        }))}
      />
      {views && (
        <Picker
          label={
            <>
              View <b>{viewLabel}</b>
            </>
          }
          groups={[{ items: views }]}
        />
      )}
      <span className="grow" />
      {children}
    </header>
  );
}

export type Tab = { label: string; on: boolean; tone: 'sys' | 'ov' | 'go' | 'you'; open(): void };

export function Tabs({
  tabs,
  patterns,
  onPatterns,
}: {
  tabs: Tab[];
  patterns: number;
  onPatterns(): void;
}) {
  return (
    <nav className="tabs" aria-label="Views in this project">
      {tabs.map((t) => (
        <button key={t.label} className={`tab ${t.tone}${t.on ? ' on' : ''}`} onClick={t.open}>
          <span className="ti" aria-hidden="true">
            {t.tone === 'go' ? (
              <Svg d={ARROW} size={18} sw={1.8} />
            ) : t.tone === 'you' ? (
              <Svg d={HAND} size={18} sw={1.8} />
            ) : (
              <Svg d={GRID} size={18} sw={1.8} />
            )}
          </span>
          {t.label}
        </button>
      ))}
      <span className="grow" />
      {patterns > 0 && (
        <button className="plain" onClick={onPatterns}>
          <Svg d="M4 6h16M4 12h10M4 18h6" sw={1.8} />
          Go patterns · {patterns}
        </button>
      )}
    </nav>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <>
      <TopBar />
      {children}
    </>
  );
}

export function AskButton({ onAsk }: { onAsk(): void }) {
  return (
    <button
      className="dark-btn"
      title="Ask Claude about what you are looking at (/)"
      onClick={onAsk}
    >
      <Svg d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z" />
      Ask
    </button>
  );
}
