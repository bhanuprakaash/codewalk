import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  PHONE,
  find,
  hrefOf,
  join,
  routeTo,
  useNav,
  type Project,
  type Route,
  type TreeNode,
} from '../route';
import { toggleTheme } from '../theme';
import { Select } from './Select';
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
const PAGE = 'M6 3h8l4 4v14H6z M14 3v4h4 M9 12h6 M9 16h6';
const MAP = 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z M9 4v14 M15 6v14';
const MENU = 'M4 7h16 M4 12h16 M4 17h16';

function usePhone() {
  const [phone, setPhone] = useState(() => matchMedia(PHONE).matches);
  useEffect(() => {
    const mq = matchMedia(PHONE);
    const on = () => setPhone(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return phone;
}

type Flow = { id: string; title: string; tone: Tone };
const flowsOf = (w: Walk): Flow[] =>
  w.workflows.map((wf) => ({
    id: wf.id,
    title: wf.title,
    tone: wf.nodes.some((id) => w.nodes[id].kind === 'you') ? 'you' : 'go',
  }));
const filesUrl = (project: string, file: string) =>
  `/files/${[project, ...file.split('/')].map(encodeURIComponent).join('/')}`;

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

const ICON: Record<Tone, string> = {
  sys: GRID,
  ov: GRID,
  go: ARROW,
  you: HAND,
  page: PAGE,
  map: MAP,
};

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
        <Svg d={ICON[tone]} size={14} sw={2} />
      </span>
      <span className="lbl">{label}</span>
    </a>
  );
}

// the flows a folder's walk or map entry plays, fetched once per file
function useFlows(project: string | undefined, want: { key: string; walk: boolean }[]) {
  const [flows, setFlows] = useState<Record<string, Flow[]>>({});
  useEffect(() => {
    for (const { key, walk } of want) {
      const id = `${project}/${key}`;
      if (id in flows) continue;
      setFlows((f) => ({ ...f, [id]: [] }));
      const url = walk
        ? `/api/walk?project=${encodeURIComponent(project!)}&scope=${encodeURIComponent(key)}`
        : filesUrl(project!, key);
      fetch(url)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!d) return;
          const list: Flow[] = walk
            ? flowsOf(d as Walk)
            : (d.flows ?? []).map((f: { id: string; title: string }) => ({
                id: f.id,
                title: f.title,
                tone: 'go',
              }));
          setFlows((f) => ({ ...f, [id]: list }));
        })
        .catch(() => {});
    }
  }, [project, want.map((w) => w.key).join()]);
  return (key: string) => flows[`${project}/${key}`] ?? [];
}

export function Sidebar() {
  const { projects, tree, route, go, menu, setMenu } = useNav();
  const project = route.project;
  const here = route.path ?? '';
  const onFlow = !!route.flow;
  const phone = usePhone();
  const [railPref, setRail] = useState(() => loadRail(onFlow));
  useEffect(() => setRail(loadRail(onFlow)), [onFlow]);
  // a phone has no rail, and the rail has no project picker
  const rail = railPref && !phone && !!project;
  const toggle = () => {
    if (phone) return setMenu(!menu);
    if (!project) return;
    setRail(!rail);
    try {
      localStorage.setItem(railKey(onFlow), rail ? '0' : '1');
    } catch {
      // private mode: the choice lasts until the next view
    }
  };
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    nav.current?.querySelector('[aria-current]')?.scrollIntoView({ block: 'nearest' });
  }, [route, tree, menu]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && phone && menu) return setMenu(false);
      if (e.key !== '[' || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as Element).closest('textarea, input, select, [role=listbox]')) return;
      e.preventDefault();
      toggle();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });

  const [open, setOpen] = useState<Record<string, boolean>>({});
  const inside = (n: TreeNode) => n.path === here || here.startsWith(n.path + '/') || !n.path;
  const isOpen = (n: TreeNode) => open[`${project}/${n.path}`] ?? inside(n);
  const flowSource = (n: TreeNode) => {
    if (n.kind === 'map') return n.path === here ? { key: n.path, walk: false } : null;
    if (n.kind !== 'dir' || !isOpen(n)) return null;
    const as = n.path === here ? route.as : undefined;
    const kind = n.entry?.find((k) => k === as) ?? n.entry?.[0];
    if (kind === 'walk') return { key: n.path, walk: true };
    return n.entry?.includes('map') ? { key: join(n.path, 'index.map.json'), walk: false } : null;
  };
  const want: { key: string; walk: boolean }[] = [];
  const walkTree = (n: TreeNode) => {
    const src = flowSource(n);
    if (src) want.push(src);
    if (n.kind === 'dir' && isOpen(n)) n.kids?.forEach(walkTree);
  };
  if (tree) walkTree(tree);
  const flowsOfKey = useFlows(project, want);

  const flowItems = (n: TreeNode) => {
    const src = flowSource(n);
    if (!src) return null;
    const list = flowsOfKey(src.key);
    const onEntry = n.path === here;
    const as = src.walk
      ? undefined
      : n.kind === 'dir' && n.entry?.[0] !== 'map'
        ? 'map'
        : undefined;
    return (
      <>
        {src.walk && (
          <Item
            to={{ project, path: n.path }}
            on={onEntry && !route.flow}
            tone="ov"
            label="Overview"
          />
        )}
        {list.map((f) => (
          <Item
            key={f.id}
            to={{ project, path: n.path, as, flow: f.id }}
            on={onEntry && route.flow === f.id}
            tone={f.tone}
            label={f.title}
          />
        ))}
      </>
    );
  };

  const row = (n: TreeNode): ReactNode => {
    if (n.kind !== 'dir') {
      return (
        <Fragment key={n.path}>
          <Item
            to={routeTo(project!, n.path)}
            on={n.path === here && !route.flow}
            tone={n.kind === 'page' ? 'page' : n.kind === 'map' ? 'map' : 'sys'}
            label={n.title || n.name}
          />
          {n.kind === 'map' && n.path === here && <div className="kids">{flowItems(n)}</div>}
        </Fragment>
      );
    }
    const exp = isOpen(n);
    // a code walk's own Overview item marks it, so its folder row does not
    const cur = n.path === here && n.entry?.[0] !== 'walk';
    const flip = () => setOpen({ ...open, [`${project}/${n.path}`]: !exp });
    return (
      <div key={n.path} className={`scope${inside(n) ? ' in' : ''}${cur ? ' cur' : ''}`}>
        <div className="frow">
          <a
            className={`fold${cur && !route.flow ? ' on' : ''}`}
            href={hrefOf({ project, path: n.path })}
            title={n.title ? `${n.name} · ${n.title}` : n.name}
            aria-current={cur && !route.flow ? 'page' : undefined}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey) return;
              e.preventDefault();
              if (rail) toggle();
              if (n.entry?.length) {
                go({ project, path: n.path });
                if (!exp) flip();
              } else flip();
            }}
          >
            <Svg d={FOLDER} size={15} sw={1.8} />
            <span className="ab" aria-hidden="true">
              {n.name.slice(0, 2)}
            </span>
            <span className="lbl">{n.name}</span>
          </a>
          <button
            className="chev"
            aria-label={exp ? `Collapse ${n.name}` : `Expand ${n.name}`}
            aria-expanded={exp}
            tabIndex={n.kids?.length || n.entry?.length ? 0 : -1}
            onClick={flip}
          >
            <Svg d={CHEVRON} size={14} />
          </button>
        </div>
        {exp && (
          <div className="kids">
            {flowItems(n)}
            {n.kids?.map((k) => row(k))}
          </div>
        )}
      </div>
    );
  };

  const name = (p: Project) => p.info?.name || p.name;
  return (
    <>
      {phone && menu && <div className="scrim" onClick={() => setMenu(false)} />}
      <aside
        className={`side${rail ? ' rail' : ''}${phone && menu ? ' open' : ''}`}
        inert={phone && !menu}
      >
        <div className="sh">
          <Select
            label="Project"
            value={project}
            placeholder="Pick a project"
            options={(projects ?? []).map((p) => ({ value: p.name, label: name(p) }))}
            onChange={(p) => go({ project: p })}
          />
          <button
            className="icon-btn"
            title={phone ? 'Close' : rail ? 'Expand sidebar ([)' : 'Collapse sidebar ([)'}
            aria-label={phone ? 'Close menu' : rail ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!rail}
            onClick={toggle}
          >
            <Svg d={PANEL} size={18} sw={1.8} />
          </button>
        </div>
        {project && tree && (
          <nav className="tree" ref={nav} aria-label="Folders in this project">
            <Item
              to={{ project }}
              on={!here && !route.flow}
              tone={tree.entry?.[0] === 'page' ? 'page' : tree.entry?.[0] === 'map' ? 'map' : 'sys'}
              label={tree.title || projects?.find((p) => p.name === project)?.info?.name || project}
            />
            {flowItems(tree)}
            {tree.kids?.map((k) => row(k))}
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
        </div>
      </aside>
    </>
  );
}

// the route's folders and file, then the view's own crumbs; ancestors are links
export function TopBar({ crumbs = [], children }: { crumbs?: string[]; children?: ReactNode }) {
  const { route, tree, go, setMenu } = useNav();
  const trail: { label: string; to?: Route }[] = [];
  if (route.project) {
    trail.push({ label: tree?.title || route.project, to: { project: route.project } });
    const parts = route.path ? route.path.split('/') : [];
    parts.forEach((_, i) => {
      const path = parts.slice(0, i + 1).join('/');
      const n = tree && find(tree, path);
      trail.push({
        label:
          (n && n.path === path && (n.kind === 'dir' ? n.name : n.title || n.name)) || parts[i],
        to: routeTo(route.project!, path),
      });
    });
    if (route.as) trail[trail.length - 1].to = { ...trail[trail.length - 1].to, as: route.as };
  } else trail.push({ label: 'codewalk' });
  for (const c of crumbs) trail.push({ label: c });
  return (
    <header>
      <button className="icon-btn menu-btn" aria-label="Open menu" onClick={() => setMenu(true)}>
        <Svg d={MENU} size={20} sw={1.8} />
      </button>
      <nav className="crumbs" aria-label="Breadcrumb">
        {trail.map((c, i) => (
          <Fragment key={i}>
            {i > 0 && <span aria-hidden="true">›</span>}
            {i === trail.length - 1 || !c.to ? (
              <b title={c.label}>{c.label}</b>
            ) : (
              <a
                href={hrefOf(c.to)}
                title={c.label}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey) return;
                  e.preventDefault();
                  go(c.to!);
                }}
              >
                {c.label}
              </a>
            )}
          </Fragment>
        ))}
      </nav>
      <span className="grow" />
      <div className="acts">{children}</div>
    </header>
  );
}

// a folder with both index.html and index.map.json switches between them
export function EntryToggle({ node, on }: { node: TreeNode; on: 'page' | 'map' }) {
  const { route, go } = useNav();
  if (!(node.entry?.includes('page') && node.entry.includes('map'))) return null;
  return (
    <div className="seg" role="group" aria-label="Show">
      {(['page', 'map'] as const).map((k) => (
        <button
          key={k}
          className={k === on ? 'on' : ''}
          aria-pressed={k === on}
          onClick={() => k !== on && go({ project: route.project, path: node.path, as: k })}
        >
          <Svg d={k === 'page' ? PAGE : MAP} size={14} />
          {k === 'page' ? 'Page' : 'Map'}
        </button>
      ))}
    </div>
  );
}

type Tone = 'sys' | 'ov' | 'go' | 'you' | 'page' | 'map';

export function PatternsButton({ n, onOpen }: { n: number; onOpen(): void }) {
  if (!n) return null;
  return (
    <button className="plain" title="Go patterns" onClick={onOpen}>
      <Svg d="M4 6h16M4 12h10M4 18h6" sw={1.8} />
      <span className="bl">Go patterns · </span>
      {n}
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
      <span className="bl">Ask</span>
    </button>
  );
}
