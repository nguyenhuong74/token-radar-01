[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/nguyenhuong74/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/nguyenhuong74/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# Token Radar — pre-token protocols ranked by a fitted, blind-tested value

An entry for [make.fun's **token-radar-01** bounty](https://make.fun/bounty/token-radar-01):
a program that reads a sealed DefiLlama snapshot of 758 protocols, prices every
protocol that records no token, and hands in a dashboard a reader can use to
decide what to farm.

## What it does

A protocol's launch is the token it may issue one day. This radar asks what that
token would be worth **if the protocol's record stayed as it is** — it does not
predict whether or when a token issues — and shows what a reader should do to
farm each protocol before and after a launch, netted to the dollar.

**The model** (`lib/model.ts`, `radar-3-fitted`) is fitted to the market, then
blind-tested before it is trusted:

- **Fitted base, chosen by a blind test** — five candidate pricers compete (see
  below). The log-log pricers regress log10(market cap) on log10(TVL) by ordinary
  least squares, pooled over the whole market or with a per-category intercept
  offset (each category's mean residual, shrunk toward zero with a pseudo-count
  of 3, clamped to half a decade); the ratio pricers use median market-cap/TVL.
  No protocol name is special-cased: every coefficient is refitted from the
  snapshot on every run.
- **Stated adjustments** — growth (1 + 0.6 × clamped 7-day TVL change), maturity
  (0.70 + 0.30 × age up to 3 years) and breadth (+3% per extra chain, up to +12%).

```
implied value = fitted base × growth × maturity × breadth
```

**The blind test** — five candidate pricers (market-median ratio, shrunk
category-median ratio, pooled log-log, log-log with category offsets, and the
mean of the last two) are each run through 5-fold cross-validation on the traded
set: fitted on four folds, priced on the fifth they had never seen, scored by
median absolute log error. The winner prices the board; the dashboard prints the
whole table. On this snapshot the winner is the pooled log-log line, pricing
held-out tokens at a median error of ×3.29, against ×5.40 for the
category-median ratio and ×4.92 for the market-median ratio.

**Rank ranges** — the winning fit is refitted 200 times on bootstrap resamples
of the traded set (seeded, so every run refits the same 200) and the board
re-ranked each time; every row reports the 10th–90th percentile of the ranks it
took.

**Farm plans, netted to the dollar** — each row sizes a deposit from the
protocol's TVL tier, prices an expected claim from its own implied value (a
stated 10% farmer allocation, spread over eligible farmer deposits taken as 5%
of TVL), and subtracts $20 of gas and the deposit's opportunity cost at 5% a
year over the hold. The verdict is FARM when the net clears $25, THIN when it
clears $0, and SKIP when it does not cover its costs. The assumptions are
printed on the dashboard next to the numbers they feed.

**The board** covers the whole 40-protocol $50M watchlist plus every other
rankable pre-token protocol below the floor (178 rows), each with a six-step
farm plan. Protocols whose token already trades are never ranked — they are the
comparison set the model is fitted on, validated on, and shown apart as
live-token comps.

## Run it

Node.js 22.18 or later, standard library only — nothing to install.

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|directory>
```

`main.ts` reads the snapshot, writes the ranked board to `out/board.json`, the
dashboard's data to `out/data.js`, copies `dashboard/` and `screenshots/` into
`out/`, and writes `out/dossier.json` with the vendored make.fun library. The
run is deterministic: two runs write the same bytes. Open `out/dashboard/` in a
browser (served, so `../data.js` loads) to use the dashboard.

## Layout

- `main.ts` — the entrypoint: snapshot in, board + dashboard + dossier out
- `lib/model.ts` — the fitted model, blind test, bootstrap ranges, farm economics
- `vendor/makefun-board.ts` — the kit's dossier library, byte for byte
- `dashboard/` — the static page (no network): `index.html`, `app.css`, `app.js`
- `screenshots/` — the board, a protocol's detail view, a filtered view

## License

MIT — see [LICENSE](LICENSE).
