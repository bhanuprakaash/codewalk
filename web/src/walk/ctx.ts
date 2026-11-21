import { createContext, useContext } from 'react';
import type { Changes } from './changes';
import type { Notes } from './notes';
import type { Walk, Workflow } from './types';

export interface Goto {
  node(id: string): void;
  type(symbol: string): void;
  method(typeSymbol: string, name: string): void;
  func(symbol: string): void;
  edge(id: string): void;
  step(i: number, wi?: string | null): void;
  whatif(id: string): void;
}
export interface Ctx {
  walk: Walk;
  wf: Workflow | null;
  wi: string | null;
  go: Goto;
  changes: Changes | null;
  notes: Notes;
  setNote(key: string, text: string | null): void;
}

export const WalkCtx = createContext<Ctx | null>(null);
export const useWalk = () => useContext(WalkCtx)!;
