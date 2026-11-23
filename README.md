# Token Horizon — token launch radar (candidate build)

An original offline token-discovery dashboard for make.fun `token-radar-01`, built around the bounty's sealed snapshot schema. **This is a candidate prototype, not an accepted submission.**

## Features
- Detects eligible pre-token protocols using token-related fields, with safeguards for obvious wrapper/pool variants.
- Includes all snapshot watchlist records and discovers smaller pre-token protocols.
- Ranks by a shrinkage-calibrated peer market-cap/TVL comparable, bounded 7-day momentum and protocol maturity.
- Provides explanatory value bands, model transparency, search/filter/sort, detail drawer, eight-step risk-aware research plans, and CSV export.
- No external network, trackers, remote fonts, CDNs, or wallet connections in the dashboard.

## Build

On Windows, install **Node.js >=22.18** first. In PowerShell:

```powershell
node --version
node --experimental-strip-types main.ts --input .\sample\synthetic_snapshot.json --output .\out
start .\out\dashboard\index.html
```

The competition supplies its own sealed snapshot under `/input/snapshot.json` when grading. A demo snapshot is included for local inspection and clearly labelled synthetic; it is not DefiLlama data.

## Before it can be submitted

1. Obtain the **official kit** from `https://make.fun/bounty/token-radar-01` and put its exact `vendor/makefun-board.ts` in `vendor/`. The program will then produce an official `dossier.json`. This kit could not be downloaded in the current isolated environment; **do not invent or substitute the vendor code**.
2. Run with the kit's mock/fixture and check the generated board has >=100 rows, covers the entire watchlist, and produces a valid dossier.
3. Capture new screenshots from the real competition output (included screenshots in this prototype are from **synthetic** data only).
4. Rebuild and record the project in a coding-agent harness with exportable **genuine** model-usage transcripts. The competition excludes hand-over-only chat sessions from paid placement. Do not falsely claim this code was developed in another harness.
5. Make a fresh GitHub repository after the competition opened, link the account to your Solana wallet, and submit via the official CLI with genuine transcripts. Never share your seed phrase.

## Risk note
Implied value is a rough valuation scenario, not a prediction, investment advice, or a claim that an airdrop will occur. Research plans avoid promising token rewards or encouraging speculative wallet activity.

License: MIT. All sample protocols are artificial.
