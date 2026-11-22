# Writing a project

How to write a codewalk project by hand or with an AI. codewalk only reads and renders these
files; there is no editor. Read this, [maps.md](maps.md) and `templates/page.html`, then write.
`examples/system-design/` is a complete example.

## Layout

A project is a folder under `~/.codewalk/`. Its folders form the sidebar tree.

```text
~/.codewalk/system-design/
  project.json              { "name": "System design" }   (display name; optional)
  index.map.json            the project's home: a roadmap whose nodes link to folders
  caching/
    index.html              the folder's overview page
    index.map.json          the folder's map
    eviction.html           another page in the folder
```

- Every folder may have an **entry**: `index.html` (a page), `index.map.json` (a map), or both.
  Clicking the folder opens its entry. With both, the top bar shows a Page / Map toggle and the
  page opens first.
- Any other `*.html` and `*.map.json` files in a folder are listed under it.
- Other files (images, notes, JSON) are not listed, but pages may reference them.
- Names starting with `.` are hidden and never served.
- Folders with no entry and no pages or maps are left out of the tree.
- `*.user.json` beside a map is written by the app (positions, notes). Do not write it.

Code projects mix in the same way: a folder with `walk.json` or `storyboard.json` is a code walk
(see the README), and `system.json` at the root is the home when there is no root index
([system.md](system.md)). Only code walks and system views have a `repo`; a notes project has
none.

## URLs

The address is the path in the project: `/<project>/<folder>/<file>`. A folder opens its entry;
`?as=page` or `?as=map` picks one when it has both. `?flow=<id>` plays a flow on a map (or a
workflow on a code walk).

## Pages

Copy `templates/page.html` for every page and keep its `<style>` block as it is.

- One column, about 760 px, 18 px text. Write in `<body>` with these blocks:
  - `.where`: a grey breadcrumb line above the title (`System design · Caching`).
  - `h1` and a `.lead` paragraph: what the page explains and why it matters.
  - `nav.toc` with a numbered `ol` of links to the sections.
  - `h2` with an `id` and a `<span class="step">N</span>` number, one per section.
  - `pre` for code and ASCII diagrams; mark comments `<span class="c">` and keywords
    `<span class="k">`.
  - `.note` for the key point of a section, `.note.aside` for a caveat.
  - `.tbl > table` for comparisons (`th` in the first row).
  - End with `<hr>` and an `h2` summary: a short list of what to remember.
- Link to other files with plain relative links: `<a href="eviction.html">`, `<a href="../">`,
  `<a href="index.map.json">`. Clicks move the app, so the sidebar follows. Links to other sites
  open in a new tab.
- No scripts: pages run in a sandbox and the server's CSP blocks them. No external fonts,
  stylesheets or images; Inter and JetBrains Mono come from the app at `/fonts/`.
- The app passes its light or dark theme in as `data-theme` on `<html>`; the template's colours
  follow it.

## Maps

See [maps.md](maps.md) for the schema. In short:

- Lay boxes out on a grid (`pos: [col, row]`) so arrows do not cross.
- Fill `what`, `why` and `gotcha` on every node; `pros`/`cons` where there is a real trade-off.
- A flow is a story told one step at a time. Put requests and replies on the same edge (replies
  with `back: true`), give each step `carries` and `ms`, and write `state` so the panel shows
  what each node holds at that moment.
- Use what-ifs for the branches that teach the most: failures, races, overload.
- Check a map with `codewalk validate path/to/file.map.json` before you finish.

## Checklist

1. `project.json` with a `name`.
2. A home: root `index.map.json` (or `index.html`) linking to the topics.
3. Per topic folder: `index.html` overview, `index.map.json` map, more pages as needed.
4. Every page copies the template; every map validates.
5. Every relative link points at a file or folder that exists.
