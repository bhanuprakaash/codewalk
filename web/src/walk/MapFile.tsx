import { useEffect, useMemo, useState } from 'react';
import { dirOf, resolve, routeTo, useNav, type TreeNode } from '../route';
import { Explorer } from './Explorer';
import { Notice } from './Header';
import { toWalk, type MapDoc } from './mapfile';
import { OVERVIEW } from './nav';
import { loadUser } from './user';
import type { User } from './types';

type Loaded = { doc: MapDoc; user: User } | { error: string } | null;

export function MapFile({
  project,
  file,
  node,
  flow,
  onFlow,
}: {
  project: string;
  file: string;
  node: TreeNode;
  flow?: string;
  onFlow(flow?: string): void;
}) {
  const { go } = useNav();
  const [data, setData] = useState<Loaded>(null);
  const query = `project=${encodeURIComponent(project)}&map=${encodeURIComponent(file)}`;

  useEffect(() => {
    let live = true;
    setData(null);
    (async () => {
      const res = await fetch(
        `/files/${[project, ...file.split('/')].map(encodeURIComponent).join('/')}`,
      );
      if (!res.ok) return { error: `Could not open ${file}.` };
      const doc = await res.json().catch(() => null);
      if (!doc || !Array.isArray(doc.nodes))
        return { error: `${file} is not a map. Run codewalk validate on it.` };
      return { doc, user: await loadUser(query) };
    })()
      .catch(() => ({ error: 'Could not reach the codewalk server. Is it running?' }))
      .then((d) => live && setData(d));
    return () => {
      live = false;
    };
  }, [query]);

  const conv = useMemo(() => (data && 'doc' in data ? toWalk(data.doc) : null), [data]);

  if (!data)
    return (
      <Notice>
        <p className="note">Opening the map…</p>
      </Notice>
    );
  if ('error' in data || !conv) {
    return (
      <Notice>
        <div className="notice">
          <h2>Nothing to show</h2>
          <p>{'error' in data ? data.error : ''}</p>
        </div>
      </Notice>
    );
  }
  return (
    <Explorer
      key={query}
      walk={conv.walk}
      whole={conv.whole}
      node={node}
      onLink={(link) => {
        const to = resolve(dirOf(file), link);
        if (to !== null) go(routeTo(project, to));
      }}
      user={data.user}
      query={query}
      view={flow ?? OVERVIEW}
      onView={(v) => onFlow(v === OVERVIEW ? undefined : v)}
    />
  );
}
