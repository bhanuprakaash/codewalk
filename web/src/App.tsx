import { useEffect, useState } from 'react';
import { toggleTheme } from './theme';
import { OVERVIEW } from './walk/nav';
import { System } from './walk/System';
import { Walk } from './walk/Walk';

type Project = { name: string; scopes: string[] };
type Route = { project?: string; scope?: string; view?: string };

const parse = (): Route => {
  const [project, scope, view] = location.pathname
    .split('/')
    .filter(Boolean)
    .map(decodeURIComponent);
  return { project, scope, view };
};
const hrefOf = (r: Route) =>
  '/' +
  [r.project, r.scope, r.view === OVERVIEW ? undefined : r.view]
    .filter((x) => x !== undefined)
    .map((x) => encodeURIComponent(x!))
    .join('/');

export function App() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [route, setRoute] = useState(parse);

  useEffect(() => {
    fetch('/api/projects')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(res.statusText))))
      .then(setProjects)
      .catch(() => setFailed(true));
    const onPop = () => setRoute(parse());
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    document.title = route.project
      ? `codewalk · ${[route.project, route.scope].filter(Boolean).join(' / ')}`
      : 'codewalk';
  }, [route.project, route.scope]);

  const navigate = (r: Route) => {
    history.pushState(null, '', hrefOf(r));
    setRoute(r);
  };

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="brand">
          <h1>codewalk</h1>
          <button title="Light / dark" onClick={toggleTheme}>
            ◐
          </button>
        </div>
        {failed && <p className="note">Could not load projects. Is codewalk running?</p>}
        {projects?.length === 0 && <p className="note">No projects in ~/.codewalk yet.</p>}
        {projects?.map((p) => (
          <section key={p.name}>
            <h2>
              <a
                href={hrefOf({ project: p.name })}
                className={route.project === p.name && !route.scope ? 'active' : ''}
                onClick={(e) => {
                  e.preventDefault();
                  navigate({ project: p.name });
                }}
              >
                {p.name}
              </a>
            </h2>
            <ul>
              {p.scopes.map((scope) => {
                const to = { project: p.name, scope };
                return (
                  <li key={scope}>
                    <a
                      href={hrefOf(to)}
                      className={route.project === p.name && route.scope === scope ? 'active' : ''}
                      onClick={(e) => {
                        e.preventDefault();
                        navigate(to);
                      }}
                    >
                      {scope}
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </nav>
      <main className="main">
        {route.project && <Crumbs route={route} onGo={navigate} />}
        {route.project && route.scope && !route.scope.startsWith('system:') ? (
          <Walk
            project={route.project}
            scope={route.scope}
            view={route.view ?? OVERVIEW}
            onView={(view) => navigate({ ...route, view })}
          />
        ) : route.project ? (
          <System
            project={route.project}
            id={route.scope?.slice('system:'.length)}
            onOpen={(drill) => navigate({ project: route.project, scope: drill })}
          />
        ) : (
          <p className="note">Pick a project or a scope on the left.</p>
        )}
      </main>
    </div>
  );
}

function Crumbs({ route, onGo }: { route: Route; onGo(r: Route): void }) {
  const parts: [string, Route][] = [[route.project!, { project: route.project }]];
  if (route.scope) parts.push([route.scope, { project: route.project, scope: route.scope }]);
  if (route.view && route.view !== OVERVIEW) parts.push([route.view, route]);
  return (
    <div className="crumbs">
      {parts.map(([label, to], i) => (
        <span key={i}>
          {i > 0 && <span className="sep">›</span>}
          {i < parts.length - 1 ? (
            <a
              href={hrefOf(to)}
              onClick={(e) => {
                e.preventDefault();
                onGo(to);
              }}
            >
              {label}
            </a>
          ) : (
            <b>{label}</b>
          )}
        </span>
      ))}
    </div>
  );
}
