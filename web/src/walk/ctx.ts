import { createContext, useContext } from 'react';
import type { Walk, Workflow } from './types';

export interface Goto {
  node(id: string): void;
  type(symbol: string): void;
  method(typeSymbol: string, name: string): void;
  edge(id: string): void;
  step(i: number, wi?: string | null): void;
  whatif(id: string): void;
}
export interface Ctx {
  walk: Walk;
  wf: Workflow | null;
  wi: string | null;
  go: Goto;
}

export const WalkCtx = createContext<Ctx | null>(null);
export const useWalk = () => useContext(WalkCtx)!;
