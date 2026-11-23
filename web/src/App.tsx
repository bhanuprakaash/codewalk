import { useEffect, useState } from 'react';
import {
  NavCtx,
  dirOf,
  find,
  hrefOf,
  parseLocation,
  viewOf,
  type Project,
  type Route,
  type TreeNode,
} from './route';
import { Notice, Sidebar } from './walk/Header';
import { MapFile } from './walk/MapFile';
import { OVERVIEW } from './walk/nav';
import { Page } from './walk/Page';
import { System } from './walk/System';
import { Walk } from './walk/Walk';

// URLs from before folder projects: /<p>/<scope>/<workflow> and /<p>/system:<id>
function legacy(tree: TreeNode, r: Route): Route | null {
  const path = r.path ?? '';
  const sys = path.match(/^system:(.+)$/);
  if (sys) return { project: r.project, path: `system-${sys[1]}.json` };
  if (find(tree, path)) return null;
  const parent = find(tree, dirOf(path));
  if (parent?.entry?.[0] === 'walk')
    return { project: r.project, path: parent.path, flow: path.split('/').pop() };
  return null;
}

export function App() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [route, setRoute] = useState(parseLocation);
  const [loaded, setTree] = useState<TreeNode | null>(null);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [menu, setMenu] = useState(!route.project);

  useEffect(() => {
    fetch('/api/projects')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(res.statusText))))
      .then(setProjects)
      .catch(() => setFailed(true));
    const onPop = () => {
      setRoute(parseLocation());
      setMenu(false);
    };
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    setTree(null);
    setTreeError(null);
    if (!route.project) return;
    let live = true;
    fetch(`/api/tree?project=${encodeURIComponent(route.project)}`)
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error ?? res.statusText);
        return body as TreeNode;
      })
      .then(
        (t) => live && setTree(t),
        (e: Error) => live && setTreeError(e.message),
      );
    return () => {
      live = false;
    };
  }, [route.project]);

  // until the new project's tree arrives, the old one must not resolve the new route
  const tree = loaded?.name === route.project ? loaded : null;
  const navigate = (r: Route, replace = false) => {
    history[replace ? 'replaceState' : 'pushState'](null, '', hrefOf(r));
    setRoute(r);
    setMenu(false);
  };

  useEffect(() => {
    const to = tree && legacy(tree, route);
    if (to) navigate(to, true);
  }, [tree, route]);

  const view = tree && route.project ? viewOf(tree, route) : null;
  useEffect(() => {
    const name = view && (view.node.path ? view.node.title || view.node.name : null);
    document.title = route.project
      ? `codewalk · ${[route.project, name].filter(Boolean).join(' / ')}`
      : 'codewalk';
  }, [route.project, view?.node]);

  const project = route.project!;
  let body;
  if (!route.project) {
    body = (
      <Notice>
        {failed && <p className="note">Could not load projects. Is codewalk running?</p>}
        {projects?.length === 0 && <p className="note">No projects in ~/.codewalk yet.</p>}
        {projects?.length !== 0 && !failed && (
          <p className="note">Pick a project in the sidebar.</p>
        )}
      </Notice>
    );
  } else if (treeError) {
    body = (
      <Notice>
        <div className="notice">
          <h2>Could not open {project}</h2>
          <p>{treeError}</p>
        </div>
      </Notice>
    );
  } else if (!tree) {
    body = (
      <Notice>
        <p className="note">Opening {project}…</p>
      </Notice>
    );
  } else if (!view) {
    body = (
      <Notice>
        <div className="notice">
          <h2>Nothing here</h2>
          <p>
            {route.path
              ? `${route.path} is not a page, a map or a folder with an entry file.`
              : 'This project has no index.html, index.map.json or system.json at its root. Pick a folder in the sidebar.'}
          </p>
        </div>
      </Notice>
    );
  } else if (view.kind === 'page') {
    body = <Page project={project} file={view.file} node={view.node} />;
  } else if (view.kind === 'map') {
    body = (
      <MapFile
        key={view.file}
        project={project}
        file={view.file}
        node={view.node}
        flow={route.flow}
        onFlow={(flow) => navigate({ ...route, flow })}
      />
    );
  } else if (view.kind === 'walk') {
    body = (
      <Walk
        project={project}
        scope={view.node.path}
        view={route.flow ?? OVERVIEW}
        onView={(v) =>
          navigate({ project, path: view.node.path, flow: v === OVERVIEW ? undefined : v })
        }
      />
    );
  } else if (view.kind === 'system') {
    body = (
      <System
        project={project}
        id={view.id}
        onOpen={(drill) =>
          navigate({
            project,
            path: drill.startsWith('system:') ? `system-${drill.slice(7)}.json` : drill,
          })
        }
      />
    );
  }

  return (
    <NavCtx.Provider value={{ projects, tree, route, go: navigate, menu, setMenu }}>
      <div className="app">
        <Sidebar />
        <main className="main">{body}</main>
      </div>
    </NavCtx.Provider>
  );
}
