# Agent Notes

## Goal

This project is building a compact earn-comparison tool focused on helping users compare yield and find better opportunities quickly.

Primary product goal:

- Compare exchange earn opportunities side by side
- Default to stablecoin-related opportunities to reduce noise
- Prefer official exchange APIs where possible
- Use a local server aggregation layer instead of calling third-party aggregators from the frontend
- Serve the frontend from our own synced local snapshot instead of live-fetching every source on each page request

Non-goal for now:

- Do not rely on Barker or any other third-party yield aggregator as the primary source

## Current Architecture

Frontend:

- `src/`
- React + Vite + TypeScript
- Frontend only calls local `/api/earn`

Backend:

- `server/`
- Express + TypeScript
- Aggregates exchange data into one normalized feed
- Syncs data on a timer and persists a local JSON snapshot

Main server files:

- `server/index.ts`
- `server/feed.ts`
- `server/feed-store.ts`
- `server/exchanges/*.ts`

## Data Source Status

### Live now

- `Bybit`
  - Uses official earn product API
  - Public endpoint
- `Gate`
  - Uses official earn APIs
  - Public endpoints
- `Binance`
  - Base layer uses official `Simple Earn` private API
  - Announcement/activity layer uses Binance website `bapi` endpoints
  - Binance announcement layer is currently experimental and can hit `429`
  - Fallback is implemented so base Binance data still works when announcement fetch fails

### Implemented but still needs credentials

- `Bitget`
  - Official private savings API adapter written
  - Needs API key / secret / passphrase
- `OKX`
  - Official private on-chain earn API adapter written
  - Needs API key / secret / passphrase

### Not connected yet

- `MEXC`
  - No stable, documented official earn-list API found
- `HTX`
  - No stable, documented official earn-list API found
- `OSL`
  - Public docs appear focused on trading/brokerage, not earn products

## Binance Research Findings

Important distinction:

- Official Binance Open Platform `Simple Earn` API only returns base product fields
- It does **not** return full marketing/activity-layer fields like:
  - reward asset such as `WLFI`
  - weekly distribution wording
  - explicit campaign start/end time
  - announcement-layer activity details

These activity-layer details were found through Binance official website endpoints:

- Announcement list:
  - `/bapi/composite/v1/public/cms/article/catalog/list/query`
- Announcement detail:
  - `/bapi/composite/v1/public/cms/article/detail/query?articleCode=...`

This means:

- Base product data can come from official documented API
- Activity-layer details likely need Binance official website announcement endpoints and/or announcement parsing
- APY history is still not sourced from Binance; if needed, we should build our own snapshot history

Current Binance adapter behavior:

- Base `Simple Earn` feed always attempted
- Announcement campaigns are merged when available
- If announcement fetch fails or is rate-limited, Binance source stays live with base data only
- Whole feed is now served from a synced local snapshot

## UI Direction

The UI has already been simplified toward comparison rather than visual flourish.

Current direction:

- Compact comparison-first layout
- Default filter favors stablecoin-related opportunities
- Cleaner expiry handling:
  - if no end date, show only `长期` and update time
- Removed low-value source-status block from the top

What the user wants from UI:

- Cleaner
- Easier comparison
- Less noise
- Default stablecoin focus

## Current Product Decisions

- Stablecoin-related filter is ON by default
- Active-only filter is ON by default
- Scope defaults to `CEX`
- Long-term products should not show fake progress bars
- Frontend should read local synced snapshot data by default

## Known Issues / Risks

### 1. Binance announcement layer rate limiting

- Current Binance website `bapi` announcement calls can hit `429`
- A short cache already exists
- Whole-feed sync now runs in the background and writes to disk
- Better long-term fix:
  - make Binance announcement sync more selective
  - possibly split Binance announcement sync cadence from the base feed cadence
  - reduce the number of announcement pages scanned on each refresh

### 2. Binance activity APR extraction is heuristic

- APR in announcement pages is parsed from title/body text
- This is better than before, but still not as reliable as a structured API
- Some activity rows may still need refinement

### 3. Stablecoin detection is keyword-based

- Frontend currently uses a keyword list to decide "stablecoin related"
- Good enough for current UX
- Could be improved later by promoting this logic to backend normalization

## Recommended Next Steps

### Highest priority

1. Make Binance activity-layer ingestion durable
   - scheduled sync + file snapshot already implemented
   - next step is reducing `429` risk further
   - ideally decouple announcement sync cadence from whole-feed sync cadence

2. Merge Binance base rows and activity rows more intelligently
   - same asset and related promotion should be linked
   - avoid showing too many parallel rows for the same coin

3. Improve comparison quality
   - better de-duplication
   - stronger stablecoin-only defaults
   - maybe exclude obvious non-comparable staking/noise rows by default

### Next after that

4. Connect Bitget once credentials are available
5. Connect OKX once credentials are available
6. Add per-platform logos for cleaner scanning
7. If needed, add persisted APY history snapshots

## Secrets / Safety

Do not write secrets into this file.

Local env file exists:

- `.env`

Important:

- `.env` is gitignored
- Binance credentials were provided during this thread and stored locally
- Because the key was shared in chat, rotating that Binance key later is recommended

## Verification

Useful commands:

```bash
npm run dev
npm run lint
npm run build
```

Runtime endpoints:

- frontend: `http://localhost:5173`
- server: `http://localhost:3001/api/health`
- aggregated feed: `http://localhost:3001/api/earn`

Current runtime behavior:

- server syncs in background every 5 minutes by default
- snapshot persists to `runtime/earn-feed.json`
- manual refresh can trigger a sync on demand

## Handoff Summary

If another agent takes over, the most important context is:

- The product goal is comparison-first, not exploration-first
- The frontend must not go back to Barker
- Binance base product data and Binance activity data are two different layers
- Current biggest technical gap is stable Binance activity ingestion without `429`
