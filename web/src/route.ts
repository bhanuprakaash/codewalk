import { createContext, useContext } from 'react';
import { OVERVIEW } from './walk/nav';

export type Project = { name: string; scopes: string[] };
export type Route = { project?: string; scope?: string; view?: string; from?: string };

export const hrefOf = (r: Route) =>
  '/' +
  [r.project, r.scope, r.view === OVERVIEW ? undefined : r.view]
    .filter((x) => x !== undefined)
    .map((x) => encodeURIComponent(x!))
    .join('/');

export function parentOf(r: Route): Route | null {
  if (r.view && r.view !== OVERVIEW) return { project: r.project, scope: r.scope, from: r.from };
  if (r.scope) return r.from ? { project: r.project, scope: r.from } : { project: r.project };
  return null;
}

export interface Nav {
  projects: Project[] | null;
  route: Route;
  go(r: Route): void;
}
export const NavCtx = createContext<Nav | null>(null);
export const useNav = () => useContext(NavCtx)!;
