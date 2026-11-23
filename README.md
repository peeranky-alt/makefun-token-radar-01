[![Token Radar](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![Rank](https://make.fun/badge/token-radar-01/peeranky-alt/makefun-token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01)
[![Reward](https://make.fun/badge/token-radar-01/peeranky-alt/makefun-token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01)

# Token Radar

A token launch radar: it reads a sealed snapshot of every protocol DefiLlama tracks,
ranks the protocols that record no token yet by what their launch would be worth, and
hands the reader a dashboard with a farm plan for each one. Built for the
[make.fun token-radar-01 bounty](https://make.fun/bounty/token-radar-01).

## The model (radar-3)

A launch candidate is a protocol that records no token and is not a wrapped, staked,
bridged or exchange product of a token that already trades — the snapshot's own
watchlist rule, applied to every row, not just the watchlist. The board covers the
whole 40-protocol watchlist plus every launch candidate the watchlist leaves out,
above and below its $50M floor: 197 rows on this snapshot.

Implied value follows only from the snapshot's own figures. The multiple is earned
from them, not picked: each category takes the median market-cap-to-TVL ratio of its
own live-token protocols (at least three of them), clamped to 0.05–1.5; the rest take
the global median (0.246 on this snapshot, 119 live tokens).

```
implied = round(tvl_usd x category_multiple
  x (1 + clamp(change_7d, -60, 120) / 100 x 0.5)
  x (0.6 + min(age_days, 1095) / 1095 x 0.4))
```

Age is the time since the protocol was first listed — how long it has run with no
token. No protocol name is special-cased: the same function scores every row, and the
multiples are computed from the snapshot at run time.

Top of the board on the 14 November 2026 snapshot: Steakhouse Financial ($534.9M),
Sentora Curator ($513.9M), Gauntlet ($318.6M), Veda ($306.3M), USDD ($144.6M).

## Held-out validation

The multiples are earned from the live-token protocols, so the model is checked on
those same protocols — but never on a protocol that scored itself. Each live-token
protocol is predicted from its TVL and compared with the market cap it actually
trades at, two ways, both computed from the snapshot at run time:

- **Leave-one-out** (119 protocols): each is predicted from multiples earned
  without it. Median prediction 0.99x the actual market cap, typical error 5.7x,
  19% of predictions within 2x.
- **Walk-forward** (84 protocols): each is predicted from multiples earned only
  from protocols listed before it — the multiples the model would have had at
  that protocol's listing date. Median prediction 0.73x, typical error 5.1x, 25%
  within 2x. The protocol's own seven-day growth and age are the snapshot's in
  both checks, since the snapshot carries no history; only the comparables
  window walks forward.

Read the implied values as order-of-magnitude ranks, not prices: the median
prediction sits close to the market, but a typical one lands several times away.

## Launch odds

A protocol that has run for years with no token is less likely to launch one next
year than a new protocol. Every row carries a 12-month launch-odds estimate from
a survival fit on the snapshot: live-token protocols count as launches that
happened by their age, pre-token candidates as protocols that have not launched
by theirs. The hazard falls with a one-year scale — a modelling choice, since one
snapshot cannot identify the decay — and its level is fitted to the snapshot by
maximum likelihood (h0 = 0.0014 per day on this snapshot; 71 live and 190
pre-token protocols in the fit). The fit implies about 40% of protocols ever
launch a token within ten years. On this snapshot the odds run from 27.5% for a
new listing down to under 1% past three years; unknown age scores as one year,
the same fallback the valuation model uses. The odds fall as age rises while the
implied value rises with it — the two columns pull in opposite directions on
purpose: the biggest implied values are the oldest, least likely launches.

## The dashboard

A static page that renders with no network: a sortable, filterable board (search,
category, chain, pre-token / live-token tabs), a detail view for every protocol with
the model's own inputs and the page's recomputation of its implied value, a
category-mix panel, the full multiples table, and a six-step farm plan per protocol
with what each step costs and how long it takes.

The cover carries an integrity strip stating what the program checked about its
own run — rows scored, watchlist covered, live-token protocols set aside,
pre-token protocols excluded by the watchlist rule, category multiples earned,
and both held-out checks — all computed from the snapshot at run time. The board
has a launch-odds column, and every farm plan states its cost in dollars per hour
of hands-on time (gas only; the capital stays in the position and comes back on
withdrawal).

## Run it

Node 22.18 or later, standard library only. The program reads the sealed snapshot
and writes the board, the dashboard data, the dashboard and the screenshots to
`/output` (or `$MAKEFUN_OUTPUT_DIR`):

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

`main.ts` is the entrypoint; `lib/model.ts` holds the model; `dashboard/` holds the
page; `vendor/makefun-board.ts` is the make.fun dossier library; `screenshots/` holds
the board, a protocol detail view and a filtered view.

## Licence

MIT — see [LICENSE](LICENSE).
