import { useEffect, useState } from 'react';
import { toggleTheme } from './theme';
import { OVERVIEW } from './walk/nav';
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
    document.title = route.scope ? `codewalk · ${route.project} / ${route.scope}` : 'codewalk';
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
            <h2>{p.name}</h2>
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
        {route.project && route.scope ? (
          <Walk
            project={route.project}
            scope={route.scope}
            view={route.view ?? OVERVIEW}
            onView={(view) => navigate({ ...route, view })}
          />
        ) : (
          <p className="note">Pick a scope on the left.</p>
        )}
      </main>
    </div>
  );
}
