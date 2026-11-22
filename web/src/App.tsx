import { useEffect, useState } from 'react';
import { NavCtx, hrefOf, type Project, type Route } from './route';
import { Notice, Sidebar } from './walk/Header';
import { OVERVIEW } from './walk/nav';
import { System } from './walk/System';
import { Walk } from './walk/Walk';

const parse = (): Route => {
  try {
    const [project, scope, view] = location.pathname
      .split('/')
      .filter(Boolean)
      .map(decodeURIComponent);
    return { project, scope, view, from: history.state?.from };
  } catch {
    return {};
  }
};

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
    history.pushState(r.from ? { from: r.from } : null, '', hrefOf(r));
    setRoute(r);
  };

  return (
    <NavCtx.Provider value={{ projects, route, go: navigate }}>
      <div className="app">
        <Sidebar />
        <main className="main">
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
              onOpen={(drill) =>
                navigate({
                  project: route.project,
                  scope: drill,
                  from: route.scope?.startsWith('system:') ? route.scope : undefined,
                })
              }
            />
          ) : (
            <Notice>
              {failed && <p className="note">Could not load projects. Is codewalk running?</p>}
              {projects?.length === 0 && <p className="note">No projects in ~/.codewalk yet.</p>}
              {projects?.length !== 0 && !failed && (
                <p className="note">Pick a project in the sidebar.</p>
              )}
            </Notice>
          )}
        </main>
      </div>
    </NavCtx.Provider>
  );
}
