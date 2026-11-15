# Token Radar — pre-token protocols ranked by implied value

An entry for make.fun's **token-radar-01** bounty: a program that reads a sealed
DefiLlama snapshot of 758 protocols, prices every protocol that records no token,
and hands in a dashboard a reader can use to decide what to farm.

## What it does

A protocol's launch is the token it may issue one day. This radar asks what that
token would be worth **if the protocol's record stayed as it is** — it does not
predict whether or when a token issues — and shows what a reader should do to
farm the protocol before and after a launch.

**The model** (`lib/model.ts`, `radar-2-comps`) prices each pre-token protocol
from the market itself, in four factors, all derived from the snapshot:

```
implied value = TVL × category comp × growth × maturity × breadth
```

- **Category comp** — the median market-cap/TVL ratio of live-token protocols in
  the same category, shrunk toward the whole market's median with a pseudo-count
  of 3 (a thin category leans on the market; a deep one stands on its own),
  clamped to 0.05–1.50. A category with no live comps prices at the market median.
- **Growth** — 1 + 0.6 × 7-day TVL change, clamped −50% to +100%.
- **Maturity** — 0.70 + 0.30 × age up to 3 years; a protocol that ran longer with
  no token prices higher.
- **Breadth** — +3% per extra chain, up to +12%.

No protocol name is special-cased: the same function scores every row, and the
category medians are recomputed from the snapshot on every run. Protocols whose
token already trades are never ranked — they are the comparison set, shown apart
in the dashboard's live-token comps table.

**The board** covers the whole 40-protocol $50M watchlist plus every other
rankable pre-token protocol below the floor (178 rows), each with a six-step farm
plan derived from its own category, chains, TVL and age — steps 1–4 farm it
before any token exists, step 5 is launch day, step 6 is what to do after the
token issues. Every step states what it costs and how long it takes.

**The dashboard** (`dashboard/`) is a static page with no network: a sortable,
filterable board (search, category, chain, watchlist-only), an expandable detail
view per protocol showing the model's step-by-step working and the full farm
plan, the category comps table, and the live-token comparison table.

## Running it

Node 22+ (standard library only, nothing to install):

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|directory>
```

It writes `out/board.json` (the ranked board), `out/data.js` (the dashboard's
data), `out/dashboard/`, `out/screenshots/` and `out/dossier.json` (built with
the vendored `vendor/makefun-board.ts`, copied unchanged from the kit).

## Layout

```
main.ts            entrypoint: snapshot in, board + dashboard + dossier out
lib/model.ts       the comps model, the board builder, the farm plans
vendor/            make.fun's dossier library, unchanged from the kit
dashboard/         index.html, app.css, app.js — the page, no network
screenshots/       the board, a detail view, a filtered view
```

## License

MIT — see `LICENSE`.
