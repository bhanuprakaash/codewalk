# codewalk

A local app for walking through a codebase: projects, scopes and the walks written for them.
It runs as a small always-on server and opens in the browser at http://codewalk.localhost:47474.
Walks are plain JSON under `~/.codewalk/<project>/<scope>/`, never in this repo.

## Install

Needs Go, Node and pnpm (the version pinned in `web/package.json`).

```sh
make install              # builds the UI, then go install ./cmd/codewalk
codewalk install          # writes the launchd agent com.codewalk and starts it
```

Open http://codewalk.localhost:47474. The agent restarts the server if it stops, and logs to
`~/Library/Logs/codewalk.log`. `codewalk uninstall` removes it.

## Use

Pick a scope in the sidebar. The address follows it: `/<project>` opens the project's system view
([docs/system.md](docs/system.md)), `/<project>/<scope>` a walk's overview and
`/<project>/<scope>/<workflow>` a workflow. Dragged boxes are saved to `user.json` beside the walk.
Ask (press `/`) runs the `claude` CLI read-only in the walk's repo, so `claude` must be on the PATH
that `codewalk install` records.

## Run without launchd

```sh
codewalk serve [--port 47474] [--data ~/.codewalk]
```

If the port is taken, `serve` exits and names the process holding it.

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
