import { useEffect, useRef, useState } from 'react';
import { routeTo, useNav, type TreeNode } from '../route';
import { EntryToggle, TopBar } from './Header';

const filesUrl = (project: string, file: string) =>
  `/files/${[project, ...file.split('/')].map(encodeURIComponent).join('/')}`;

// An AI-written HTML page. It runs no scripts (iframe sandbox + the server's CSP), so the app does
// the page's work for it: it passes the theme in and turns link clicks into app navigation.
export function Page({ project, file, node }: { project: string; file: string; node: TreeNode }) {
  const { go } = useNav();
  const frame = useRef<HTMLIFrameElement>(null);
  const [missing, setMissing] = useState(false);
  const [ready, setReady] = useState(false);
  const src = filesUrl(project, file);

  useEffect(() => {
    const el = frame.current!;
    const prefix = `/files/${encodeURIComponent(project)}/`;
    const theme = () => {
      const doc = el.contentDocument;
      if (doc?.documentElement)
        doc.documentElement.dataset.theme = document.documentElement.dataset.theme;
    };
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element).closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || e.defaultPrevented) return;
      const url = new URL(a.href);
      const here = el.contentWindow!.location;
      if (url.origin === location.origin && url.pathname === here.pathname && url.hash) return;
      e.preventDefault();
      if (url.origin !== location.origin) {
        open(url.href, '_blank', 'noopener');
      } else if (url.pathname.startsWith(prefix) || url.pathname === prefix.slice(0, -1)) {
        const path = decodeURIComponent(url.pathname.slice(prefix.length)).replace(/\/$/, '');
        if (e.metaKey || e.ctrlKey) open(url.href, '_blank', 'noopener');
        else go(routeTo(project, path));
      }
    };
    const onLoad = () => {
      const doc = el.contentDocument;
      setMissing(!doc || doc.contentType === 'application/json');
      theme();
      setReady(true);
      doc?.addEventListener('click', onClick);
    };
    setReady(false);
    const watch = new MutationObserver(theme);
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    el.addEventListener('load', onLoad);
    return () => {
      watch.disconnect();
      el.removeEventListener('load', onLoad);
      el.contentDocument?.removeEventListener('click', onClick);
    };
  }, [project, src]);

  return (
    <div className="pagev">
      <TopBar>
        <EntryToggle node={node} on="page" />
      </TopBar>
      {missing && <p className="note">Could not open {file}.</p>}
      <iframe
        ref={frame}
        key={src}
        src={src}
        title={node.title || file}
        sandbox="allow-same-origin"
        hidden={missing}
        style={{ visibility: ready ? 'visible' : 'hidden' }}
      />
    </div>
  );
}
