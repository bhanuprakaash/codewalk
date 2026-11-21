# System view

A project's map: the boxes it is made of and how they talk. It opens at `/<project>` on the same
canvas as a walk.

## Files

```text
~/.codewalk/<project>/
  system.json               written by hand or by a skill
  system.built.json         written by `codewalk validate system.json`; the app reads only this
  system-<id>.json          a child system view (optional), built to system-<id>.built.json
  user.json                 owned by the app: positions, notes and seen commits of every system view
```

`codewalk validate <project>/system.json` checks the file against the repo and writes the built
file only when there are no errors. The app serves the built file as written
(`/api/system?project=<p>[&id=<id>]`), so the view still opens after the repo moves on.

## Format

```json
{
  "title": "Reef",
  "repo": "/path/to/repo",
  "summary": "One line on what the system is.",
  "boxes": [
    {
      "id": "run",
      "kind": "package",
      "label": "run",
      "what": "One run: prompt, provider call, reply.",
      "icon": "si:go",
      "pos": [2, 1],
      "pkg": "run",
      "types": ["run:Manager"],
      "drill": "run"
    }
  ],
  "edges": [{ "from": "server", "to": "run", "kind": "imports", "label": "", "what": "" }]
}
```

- `repo`: absolute, or relative to the folder holding `system.json`.
- Box `kind`: `ui`, `service`, `package`, `store`, `outside`. `label` defaults to `id`.
- `pos`: `[col, row]`, required on every box. A column is 360 px, a row 170 px, as in walks.
- `icon` (optional, defaults to the kind's icon): one of our line icons (`ui`, `service`,
  `package`, `store`, `outside`, `database`, `key`, `agent`, `browser`, `desktop`, `git`, `queue`,
  `file`) or a vendored Simple Icons logo as `si:<slug>` (`anthropic`, `claude`, `git`, `github`,
  `go`, `react`, `sqlite`, `tauri`). Logos are drawn in one colour, the text colour. An unknown name
  falls back to the kind's icon. To add a logo, copy its path from Simple Icons (CC0) into
  `web/src/walk/logos.ts`.
- Package boxes: `pkg` is the repo-relative package dir; `types` lists `dir:Type` symbols the box
  owns. They show as chips under the box and open the type card.
- `drill` (optional): clicking the box opens it instead of the box card.
  - `"<scope>"`: a scope folder in the same project (`<project>/<scope>/`, with a storyboard or walk).
  - `"system:<id>"`: the child system view `<project>/system-<id>.json`, at `/<project>/system:<id>`.
- Edge `kind`: `calls`, `http`, `sse`, `mcp`, `imports`, `stores`. The edge shows its `label`, or
  its kind when there is none; `what` shows on the edge and box cards.

## What validate checks

- every package box's `pkg` dir exists in the repo;
- every `imports` edge joins two package boxes and matches a real Go import between those
  packages (from the scan; test files are not counted);
- every listed type exists in its package;
- every drill target exists.

## Changes

A package box gets a dot when any file in its package differs between the view's seen commit in
the project's `user.json` (default: the commit the view was built from) and the repo's HEAD; its
card lists the files. The seen commit is `seenSha` for the root view and `seenSha:system:<id>` for
a child view. "Mark seen" stores HEAD there.

## Positions

Dragged boxes are saved in the project's `user.json` under `positions.system` (or
`positions["system:<id>"]` for a child view), with the same layout check as walks: when the built
positions change, saved drags are dropped. Double-click the canvas to reset.

## Notes

A note on a box is saved in the project's `user.json` under `notes["box:<view>:<box id>"]`, where
`<view>` is `system` or `system:<id>`, so the same box id in two views has two notes. Notes on
types and funcs are keyed by their symbol. A view lists a note as orphaned when its box or symbol
is no longer in the view; it only checks its own `box:<view>:` notes and symbol notes.
