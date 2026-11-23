import { useState } from 'react';
import { STATIC } from '../static';
import { useWalk } from './ctx';
import { Sec } from './parts';
import type { Walk } from './types';

export type Notes = Record<string, string>;

// a note is keyed by symbol so it survives a rebuild; nodes without one fall back to their id
export const nodeKey = (id: string, symbol?: string) => symbol || `node:${id}`;
export const boxKey = (view: string, id: string) => `box:${view}:${id}`;

// view is set for a system view: its box notes are keyed per view, and the project's other views'
// box notes are not this view's to judge. The root view's prefix also matches a child view's keys,
// so it only owns keys with no further ':'.
export function orphans(walk: Walk, notes: Notes, view?: string) {
  const live = new Set<string>();
  for (const n of Object.values(walk.nodes))
    live.add(view ? boxKey(view, n.id) : nodeKey(n.id, n.symbol));
  for (const t of Object.values(walk.types)) {
    live.add(t.symbol);
    for (const m of t.methods) live.add(m.symbol);
  }
  for (const k of Object.keys(walk.funcs ?? {})) live.add(k);
  const mine = (k: string) => {
    const id = k.slice(`box:${view}:`.length);
    return k.startsWith(`box:${view}:`) && (view !== 'system' || !id.includes(':'));
  };
  return Object.entries(notes).filter(
    ([k]) => !live.has(k) && (!view || !k.startsWith('box:') || mine(k)),
  );
}

export function NoteSec({ k }: { k: string }) {
  const { notes, setNote } = useWalk();
  const text = notes[k];
  const [draft, setDraft] = useState<string | null>(null);
  if (draft !== null)
    return (
      <Sec h="Your note">
        <textarea
          className="note-input"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <div className="note-actions">
          <button
            onClick={() => {
              setNote(k, draft.trim() || null);
              setDraft(null);
            }}
          >
            Save
          </button>
          <button onClick={() => setDraft(null)}>Cancel</button>
        </div>
      </Sec>
    );
  if (!text)
    return STATIC ? null : (
      <p className="note-add">
        <a onClick={() => setDraft('')}>+ Add a note</a>
      </p>
    );
  return (
    <Sec h="Your note">
      <div className="pinned">{text}</div>
      {!STATIC && (
        <div className="note-actions">
          <a onClick={() => setDraft(text)}>Edit</a>
          <a onClick={() => setNote(k, null)}>Delete</a>
        </div>
      )}
    </Sec>
  );
}

export function OrphansCard({ list }: { list: [string, string][] }) {
  const { setNote } = useWalk();
  return (
    <>
      <div className="card-h">
        <h2>Orphaned notes</h2>
      </div>
      <p className="empty">
        What these notes were pinned to is gone from the rebuilt view. Copy what you still need,
        then delete them.
      </p>
      {list.map(([k, text]) => (
        <Sec key={k} h={<code className="note-key">{k}</code>}>
          <div className="pinned">{text}</div>
          {!STATIC && (
            <div className="note-actions">
              <a onClick={() => setNote(k, null)}>Delete</a>
            </div>
          )}
        </Sec>
      ))}
    </>
  );
}
