# Token Horizon

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![Rank](https://make.fun/badge/token-radar-01/gjrtyu-debug/token-horizon-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard)
[![Reward](https://make.fun/badge/token-radar-01/gjrtyu-debug/token-horizon-radar/reward.svg)](https://make.fun/bounty/token-radar-01)

Token Horizon is an offline token launch radar built with a coding agent for the [make.fun token launch radar bounty](https://make.fun/bounty/token-radar-01). It ranks pre-token protocols by implied network value and includes the entire sealed snapshot watchlist.

The dashboard explains each valuation with category-level market-cap-to-TVL comparables, momentum and maturity. Readers can filter by chain or category, browse every ranked protocol, inspect the sensitivity band and research steps, and export the board as CSV.

## Run locally

Use Node.js 22.18 or later. From the repository root, run the bundled synthetic demo:

```powershell
node main.ts --input ./sample/synthetic_snapshot.json --output ./out
```

Open `out/dashboard/index.html` in your browser. The files work offline. To reproduce the results on the competition dataset, point `--input` to the official kit's `input/snapshot.json`.

The runner produces `board.json`, an offline dashboard, and `dossier.json` using the official make.fun library in `vendor/`. The images in `screenshots/` show the real competition dataset.

The implied value is a research scenario. Reward eligibility and costs depend on each protocol's published terms.

License: MIT.
