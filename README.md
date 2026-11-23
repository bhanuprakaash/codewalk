# codewalk

A local app for learning a subject: a codebase, a system design topic, an architecture. A project
is a folder tree of AI-written reading pages (`*.html`) and maps (`*.map.json`: boxes, arrows and
flows that play step by step), plus code walks built from a repo. It runs as a small always-on
server and opens in the browser at http://codewalk.localhost:47474. Projects live under
`~/.codewalk/<project>/`, never in this repo. [docs/authoring.md](docs/authoring.md) says how to
write one.

## Install

Needs Go, Node and pnpm (the version pinned in `web/package.json`).

```sh
make install              # builds the UI, then go install ./cmd/codewalk
codewalk install          # writes the launchd agent com.codewalk and starts it
```

Open http://codewalk.localhost:47474. The agent restarts the server if it stops, and logs to
`~/Library/Logs/codewalk.log`. `codewalk uninstall` removes it.

## Try the example

```sh
cp -r examples/system-design ~/.codewalk/
```

Open http://codewalk.localhost:47474/system-design: a roadmap, then `caching/` with an overview
page and a map whose flows play a cache hit, a miss, a write with invalidation, Redis going down
and LRU eviction, with what-ifs for a stampede and stale reads.

## Use

Pick a project in the sidebar; its folders are the tree below. The address is the path in the
project: `/<project>` opens the root entry, `/<project>/<folder>` a folder's entry
(`index.html` or `index.map.json`, `?as=page|map` when it has both) and `/<project>/<file>` a page
or map. `?flow=<id>` plays a flow ([docs/maps.md](docs/maps.md)) or a code walk's workflow. A
folder with `walk.json` is a code walk; `system.json` at the root is the project's system view
([docs/system.md](docs/system.md)) when there is no root index. Old `/<project>/<scope>/<workflow>`
links redirect. Dragged boxes are saved to `user.json` beside the walk.
An amber border marks a node whose symbol's lines changed (a dot marks one that is gone) between
the commit you last marked seen (`seenSha` in `user.json`, by default the commit the walk was built
from) and the repo's HEAD; its card shows the diff. On a system view the border marks a package
box with any change in its package. "Mark seen" stores HEAD and clears the marks.
A note on a node, type or method (or a system box) is kept in `user.json` under `notes`, keyed
by symbol (`node:<id>` for a node without one, `box:<id>` for a box), so it survives a rebuild. A
note whose target is gone after a rebuild is listed under "Orphaned notes" with its old key.
`codewalk validate` also lists the Go patterns it finds in the scanned packages (goroutine +
channel, select, context cancel, mutex-guarded state, interface with several impls, sentinel
errors checked with `errors.Is`): on a walk's overview, and behind "Go patterns" on a system view.
Each link opens that symbol's node card when it is on the walk, otherwise its method, func or type
card. The list comes from scan facts only; the one-line explanations are fixed text.
Ask (press `/`) runs the `claude` CLI read-only in the walk's repo, so `claude` must be on the PATH
that `codewalk install` records.

## Run without launchd

```sh
codewalk serve [--port 47474] [--data ~/.codewalk]
```

If the port is taken, `serve` exits and names the process holding it.

## Read-only copy

`codewalk export [--data DIR] <out dir>` writes a static, read-only copy of every project for a
host such as Cloudflare Pages: pages, maps, walks and system views, with notes shown but not
editable. Ask, change marks and saving dragged boxes need the local app. It includes walk code
from the walked repos. `_worker.js` in the copy asks for a password (any user name) and serves
nothing until the `PASSWORD` secret is set.

```sh
codewalk export ~/codewalk-site
npx wrangler pages deploy ~/codewalk-site --project-name codewalk
npx wrangler pages secret put PASSWORD --project-name codewalk
npx wrangler pages deploy ~/codewalk-site --project-name codewalk   # picks up the secret
```

## Update

```sh
git pull && make install   # rebuilds and restarts the launchd agent
```

## Develop

```sh
make check    # gofmt, vet, go test, tsc, prettier
make format
make build    # UI into web/dist, then ./codewalk
```
