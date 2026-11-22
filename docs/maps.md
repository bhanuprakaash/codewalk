# Maps

A map is a canvas you write by hand (or an AI writes): boxes, arrows, and flows that play step by
step, with no code or repo behind it. It is one file, `<name>.map.json`, anywhere in a project
folder, and needs no build step. `codewalk validate <file>.map.json` checks it.

Code walks (`walk.json`) and system views (`system.json`) are the other kinds of map; they come
from a repo and are described in [system.md](system.md).

## Shape

```json
{
  "title": "Caching",
  "summary": "One short paragraph: what this map shows.",
  "nodes": [
    {
      "id": "app",
      "kind": "service",
      "label": "App server",
      "sub": "stateless · 3 replicas",
      "pos": [1, 1],
      "what": "What it does, one or two sentences.",
      "why": "Why it is there; the reason or trade-off behind it.",
      "gotcha": "The thing people get wrong.",
      "pros": ["What you gain."],
      "cons": ["What it costs."],
      "body": "<p>Longer notes. Plain text or simple HTML.</p>",
      "link": "eviction.html"
    }
  ],
  "edges": [
    {
      "from": "app",
      "to": "cache",
      "kind": "call",
      "label": "GET user:42",
      "proto": "RESP",
      "cond": "",
      "what": "What crosses this arrow and when."
    }
  ],
  "flows": [
    {
      "id": "read-hit",
      "title": "Read · cache hit",
      "summary": "What this flow shows.",
      "steps": [
        {
          "at": "app->cache",
          "title": "App asks the cache",
          "does": "What happens in this step, in a sentence or three.",
          "carries": "GET user:42",
          "ms": 0.4,
          "tag": "HIT",
          "tone": "ok",
          "note": "The one thing to notice here.",
          "values": [{ "name": "reply", "value": { "id": 42, "name": "Ada" } }],
          "state": [{ "of": "cache", "name": "user:42", "value": { "name": "Ada" }, "note": "TTL 41 s" }]
        }
      ],
      "whatifs": [
        {
          "id": "miss",
          "title": "the key is not cached",
          "summary": "One line.",
          "fork": 0,
          "steps": []
        }
      ]
    }
  ]
}
```

## Nodes

- `id` (required, unique), `kind` (required), `pos` (required): `[col, row]`; a column is 360 px
  and a row 170 px. Fractions are fine.
- `label` defaults to `id`; `sub` is a short second line on the box.
- `kind` sets the icon and colour:

  | kind       | for                                     |
  | ---------- | --------------------------------------- |
  | `client`   | browser, phone, caller                  |
  | `lb`       | load balancer, gateway, proxy           |
  | `service`  | an app server or API                    |
  | `cache`    | Redis, Memcached, an in-process cache   |
  | `db`       | a database: the source of truth         |
  | `queue`    | a queue, log or stream                  |
  | `cdn`      | CDN or edge cache                       |
  | `worker`   | a background consumer or job            |
  | `external` | a third-party system                    |
  | `topic`    | a subject on a roadmap (usually a link) |

  The walk kinds (`start`, `store`, `outside`, `ui`, `package`, …) work too. `icon` overrides the
  kind's icon with any icon from [system.md](system.md).

- `what`, `why`, `gotcha`, `pros`, `cons`, `body` show on the node's card. `body` may hold simple
  HTML (`p`, `b`, `i`, `em`, `strong`, `code`, `pre`, `ul`, `ol`, `li`, `br`, `a`); anything else is
  dropped.
- `link`: a path relative to this file's folder, to a folder (`caching/`) or a file
  (`eviction.html`, `other.map.json`). Clicking the box opens it; the card still has the details.

## Edges

- `from`, `to`: node ids. The arrow points at `to`.
- `id` defaults to `from->to`. Give an `id` only when two edges join the same pair the same way.
- `kind`: `call` (default; a request), `when` (only under `cond`, drawn dashed), `go` (async: a
  message or a job, nobody waits), `stores` (writes to storage), `asks` (waits on a person).
- `label` is the pill on the arrow; `proto` (HTTP, gRPC, SQL, RESP, AMQP…) is shown with it.
  `what` shows on the edge card.

## Flows

A flow is an ordered list of steps over the map. It shows every node unless `nodes` lists a
subset. Steps play with Next/Back (or the arrow keys); the canvas lights the step's node or edge
and dims the rest.

Step fields:

- `at` (required): a node id (something happens inside it) or an edge id (something crosses it).
- `back: true`: the step travels the edge backwards, `to` → `from`. Use it for replies, so one
  edge carries both the request and the response.
- `title` (required), `does`, `note` (a "Notice" line).
- `carries`: the short label on the moving packet (`GET user:42`, `200 OK`, `row v7`).
- `ms`: how long this step takes. The state panel adds them up, so a hit and a miss can be
  compared in total latency.
- `tag` + `tone`: a badge on the step (`HIT`/`ok`, `MISS`/`warn`, `STALE`/`bad`, `info`).
- `values`: data seen in this step, `[{ "name", "value", "note"? }]`; `value` is any JSON.
- `state`: what the system holds after this step, `[{ "of"?, "name", "value", "note"? }]`.
  `of` is the node that holds it (the panel groups by it). State carries forward: write only what
  changes. An item with the same `of` + `name` replaces the old one; `"value": null` removes it.
  The panel marks what changed in this step.

## What-ifs

A what-if forks a flow: `fork` is the index (0-based) of the step after which it diverges. Its
`steps` replace the rest of the flow, and its state starts from the flow's state at `fork`. The
fork step offers it ("What if…"), and Back from its first step returns to the flow.

## Where it shows

- A folder whose entry is `index.map.json` opens the map. If it also has `index.html`, a
  Page / Map toggle picks between them.
- Flows show in the sidebar under the map and in the map's summary box. The URL holds the flow
  as `?flow=<id>`.
- Dragged boxes are saved per map in `<name>.user.json` beside it (notes on nodes too). The app
  owns that file.
