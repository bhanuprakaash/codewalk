import { useState } from 'react';
import { useWalk } from './ctx';
import { Sec } from './parts';
import type { Walk } from './types';

export type Notes = Record<string, string>;

// a note is keyed by symbol so it survives a rebuild; nodes without one fall back to their id
export const nodeKey = (id: string, symbol?: string) => symbol || `node:${id}`;
export const boxKey = (id: string) => `box:${id}`;

export function orphans(walk: Walk, notes: Notes, boxes: boolean) {
  const live = new Set<string>();
  for (const n of Object.values(walk.nodes))
    live.add(boxes ? boxKey(n.id) : nodeKey(n.id, n.symbol));
  for (const t of Object.values(walk.types)) {
    live.add(t.symbol);
    for (const m of t.methods) live.add(m.symbol);
  }
  return Object.entries(notes).filter(([k]) => !live.has(k));
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
    return (
      <p className="note-add">
        <a onClick={() => setDraft('')}>+ Add a note</a>
      </p>
    );
  return (
    <Sec h="Your note">
      <div className="pinned">{text}</div>
      <div className="note-actions">
        <a onClick={() => setDraft(text)}>Edit</a>
        <a onClick={() => setNote(k, null)}>Delete</a>
      </div>
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
          <div className="note-actions">
            <a onClick={() => setNote(k, null)}>Delete</a>
          </div>
        </Sec>
      ))}
    </>
  );
}
