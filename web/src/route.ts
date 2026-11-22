import { createContext, useContext } from 'react';

export type Project = { name: string; info?: { name?: string } };
// path is the folder or file inside the project ("" is its root); flow picks a workflow on a map
export type Route = { project?: string; path?: string; flow?: string; as?: 'page' | 'map' };

export type EntryKind = 'page' | 'map' | 'walk' | 'system';
export interface TreeNode {
  name: string;
  path: string;
  kind: 'dir' | EntryKind;
  title?: string;
  entry?: EntryKind[];
  kids?: TreeNode[];
}

export const hrefOf = (r: Route) => {
  const path = [r.project, ...(r.path ? r.path.split('/') : [])]
    .filter((x) => x !== undefined)
    .map((x) => encodeURIComponent(x!))
    .join('/');
  const q = new URLSearchParams();
  if (r.as) q.set('as', r.as);
  if (r.flow) q.set('flow', r.flow);
  return '/' + path + (q.size ? '?' + q : '');
};

export function parseLocation(): Route {
  try {
    const [project, ...rest] = location.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    const q = new URLSearchParams(location.search);
    const as = q.get('as');
    return {
      project,
      path: rest.join('/'),
      flow: q.get('flow') ?? undefined,
      as: as === 'page' || as === 'map' ? as : undefined,
    };
  } catch {
    return {};
  }
}

export function find(tree: TreeNode, path: string): TreeNode | null {
  if (tree.path === path) return tree;
  for (const k of tree.kids ?? []) {
    if (path === k.path || path.startsWith(k.path + '/')) return find(k, path);
  }
  return null;
}

export type View =
  | { kind: 'page' | 'map'; file: string; node: TreeNode }
  | { kind: 'walk'; node: TreeNode }
  | { kind: 'system'; id?: string; node: TreeNode };

// what a route shows: a folder opens its entry (the one `as` asks for, else its first)
export function viewOf(tree: TreeNode, r: Route): View | null {
  const node = find(tree, r.path ?? '');
  if (!node) return null;
  if (node.kind === 'dir') {
    const kind = node.entry?.find((k) => k === r.as) ?? node.entry?.[0];
    if (!kind) return null;
    if (kind === 'page' || kind === 'map')
      return {
        kind,
        node,
        file: join(node.path, kind === 'page' ? 'index.html' : 'index.map.json'),
      };
    return { kind, node };
  }
  if (node.kind === 'system')
    return { kind: 'system', node, id: node.path.match(/^system-(.+)\.json$/)?.[1] };
  if (node.kind === 'walk') return { kind: 'walk', node };
  return { kind: node.kind, node, file: node.path };
}

export const join = (...parts: string[]) => parts.filter(Boolean).join('/');

// resolves a link written in a file in folder `dir` to a project path; null when it leaves it
export function resolve(dir: string, link: string): string | null {
  const out: string[] = dir ? dir.split('/') : [];
  for (const part of link.split('/')) {
    if (part === '..') {
      if (!out.length) return null;
      out.pop();
    } else if (part && part !== '.') out.push(part);
  }
  return out.join('/');
}

export const dirOf = (path: string) => path.split('/').slice(0, -1).join('/');

// a link to a folder's entry file opens the folder, on that entry
export function routeTo(project: string, path: string): Route {
  const m = path.match(/^(?:(.*)\/)?index\.(html|map\.json)$/);
  if (m) return { project, path: m[1] ?? '', as: m[2] === 'html' ? 'page' : 'map' };
  return { project, path };
}

export interface Nav {
  projects: Project[] | null;
  tree: TreeNode | null;
  route: Route;
  go(r: Route, replace?: boolean): void;
}
export const NavCtx = createContext<Nav | null>(null);
export const useNav = () => useContext(NavCtx)!;
