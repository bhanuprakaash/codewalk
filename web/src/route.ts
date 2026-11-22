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

export interface Nav {
  projects: Project[] | null;
  route: Route;
  go(r: Route): void;
}
export const NavCtx = createContext<Nav | null>(null);
export const useNav = () => useContext(NavCtx)!;
