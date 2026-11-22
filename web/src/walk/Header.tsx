import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { hrefOf, useNav, type Route } from '../route';
import { toggleTheme } from '../theme';
import { OVERVIEW } from './nav';
import type { Walk } from './types';

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
const FOLDER = 'M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z';
const PANEL = 'M3 4h18v16H3z M9 4v16';

type Flow = { id: string; title: string; tone: 'go' | 'you' };
const flowsOf = (w: Walk): Flow[] =>
  w.workflows.map((wf) => ({
    id: wf.id,
    title: wf.title,
    tone: wf.nodes.some((id) => w.nodes[id].kind === 'you') ? 'you' : 'go',
  }));

const railKey = (onFlow: boolean) => `codewalk:rail:${onFlow ? 'workflow' : 'map'}`;
function loadRail(onFlow: boolean) {
  try {
    const v = localStorage.getItem(railKey(onFlow));
    if (v) return v === '1';
  } catch {
    // private mode: fall back to the default
  }
  return onFlow;
}

function Item({ to, on, tone, label }: { to: Route; on: boolean; tone: Tone; label: string }) {
  const { go } = useNav();
  return (
    <a
      href={hrefOf(to)}
      className={`tab ${tone}${on ? ' on' : ''}`}
      title={label}
      aria-current={on ? 'page' : undefined}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        go(to);
      }}
    >
      <span className="ti" aria-hidden="true">
        <Svg d={tone === 'go' ? ARROW : tone === 'you' ? HAND : GRID} size={14} sw={2} />
      </span>
      <span className="lbl">{label}</span>
    </a>
  );
}

export function Sidebar() {
  const { projects, route, go } = useNav();
  const project = route.project;
  const scopes = projects?.find((p) => p.name === project)?.scopes ?? [];
  const onSystem = !route.scope || route.scope.startsWith('system:');
  const onFlow = !onSystem && !!route.view && route.view !== OVERVIEW;
  const [rail, setRail] = useState(() => loadRail(onFlow));
  useEffect(() => setRail(loadRail(onFlow)), [onFlow]);
  const toggle = () => {
    setRail(!rail);
    try {
      localStorage.setItem(railKey(onFlow), rail ? '0' : '1');
    } catch {
      // private mode: the choice lasts until the next view
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '[' || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as Element).closest('textarea, input, select')) return;
      e.preventDefault();
      toggle();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });

  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [flows, setFlows] = useState<Record<string, Flow[]>>({});
  const expanded = scopes.filter((s) => open[s] ?? s === route.scope);
  useEffect(() => {
    for (const scope of expanded) {
      const key = `${project}/${scope}`;
      if (key in flows) continue;
      setFlows((f) => ({ ...f, [key]: [] }));
      fetch(`/api/walk?project=${encodeURIComponent(project!)}&scope=${encodeURIComponent(scope)}`)
        .then((r) => (r.ok ? (r.json() as Promise<Walk>) : null))
        .then((w) => w && setFlows((f) => ({ ...f, [key]: flowsOf(w) })))
        .catch(() => {});
    }
  }, [project, expanded.join()]);

  return (
    <aside className={`side${rail ? ' rail' : ''}`}>
      <div className="sh">
        <select
          aria-label="Project"
          value={project ?? ''}
          onChange={(e) => go({ project: e.target.value })}
        >
          {!project && <option value="">Pick a project</option>}
          {(projects ?? []).map((p) => (
            <option key={p.name}>{p.name}</option>
          ))}
        </select>
      </div>
      {project && (
        <nav className="tree" aria-label="Views in this project">
          <Item to={{ project }} on={onSystem} tone="sys" label="System" />
          {scopes.length > 0 && <div className="sec">Scopes</div>}
          {scopes.map((scope) => {
            const exp = expanded.includes(scope);
            return (
              <div key={scope} className={`scope${scope === route.scope ? ' cur' : ''}`}>
                <button
                  className="fold"
                  title={scope}
                  aria-expanded={exp}
                  onClick={() => {
                    if (rail) toggle();
                    setOpen({ ...open, [scope]: rail || !exp });
                  }}
                >
                  <Svg d={FOLDER} size={15} sw={1.8} />
                  <span className="lbl">{scope}</span>
                  <span className="chev" aria-hidden="true">
                    <Svg d={CHEVRON} size={14} />
                  </span>
                </button>
                {exp && (
                  <div className="kids">
                    <Item
                      to={{ project, scope }}
                      on={scope === route.scope && (route.view ?? OVERVIEW) === OVERVIEW}
                      tone="ov"
                      label="Overview"
                    />
                    {(flows[`${project}/${scope}`] ?? []).map((f) => (
                      <Item
                        key={f.id}
                        to={{ project, scope, view: f.id }}
                        on={scope === route.scope && route.view === f.id}
                        tone={f.tone}
                        label={f.title}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      )}
      <div className="sf">
        <button
          className="icon-btn"
          title="Light / dark"
          aria-label="Light / dark"
          onClick={toggleTheme}
        >
          <span className="moon">
            <Svg d={MOON} size={18} sw={1.8} />
          </span>
          <span className="sun">
            <Svg d={SUN} size={18} sw={1.8} />
          </span>
        </button>
        <button
          className="icon-btn"
          title={rail ? 'Expand sidebar ([)' : 'Collapse sidebar ([)'}
          aria-label={rail ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!rail}
          onClick={toggle}
        >
          <Svg d={PANEL} size={18} sw={1.8} />
        </button>
      </div>
    </aside>
  );
}

export function TopBar({ crumbs, children }: { crumbs?: string[]; children?: ReactNode }) {
  const { route } = useNav();
  const trail = crumbs ?? [route.project ?? 'codewalk'];
  return (
    <header>
      <nav className="crumbs" aria-label="Breadcrumb">
        {trail.map((c, i) => (
          <Fragment key={i}>
            {i > 0 && <span aria-hidden="true">›</span>}
            {i === trail.length - 1 ? <b>{c}</b> : <span>{c}</span>}
          </Fragment>
        ))}
      </nav>
      <span className="grow" />
      {children}
    </header>
  );
}

type Tone = 'sys' | 'ov' | 'go' | 'you';

export function PatternsButton({ n, onOpen }: { n: number; onOpen(): void }) {
  if (!n) return null;
  return (
    <button className="plain" onClick={onOpen}>
      <Svg d="M4 6h16M4 12h10M4 18h6" sw={1.8} />
      Go patterns · {n}
    </button>
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
