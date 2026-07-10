---
name: add-streaming-platform
description: Add a new streaming platform/provider adapter to the Dramain Aja app (Node/Express short-drama streamer). Use when the user asks to add a new drama platform, a new provider, or a new upstream data source to this project.
---

# Add Streaming Platform (Dramain Aja)

Dramain Aja loads one **adapter module per platform**. `server.js` never talks
to any upstream API directly — it only calls a fixed set of adapter
functions. Adding a platform means writing one adapter file with that exact
function contract and registering it in `lib/config.js`. Nothing else needs
to change (frontend, routes, and category rows are all platform-agnostic).

## Step 1 — Investigate the new upstream API first

Before writing any code, confirm with real requests (curl / fetch) — do not
guess field names from docs alone:
- Base URL and auth method (API key as query param, header, or none).
- Whether it returns JSON directly or wraps results in `{ items: [...] }` /
  `{ data: [...] }`.
- Field names for id, title, cover image, description, episode count.
- Whether "episode list" and "drama detail" are the same endpoint or
  separate ones (in the existing DramaBox adapter these were separate and
  the detail endpoint's episode numbering was unreliable — always sanity
  check by comparing episode `number` against the array index).
- How locked/premium episodes are marked.
- How the video manifest is resolved (some APIs return a playable URL
  directly in the episode object; DramaBox requires a separate `hls` action
  that returns a raw `.m3u8` manifest needing the API key).

If the platform needs a secret (API key, token), get it via the
environment-secrets flow — **never hardcode it in the adapter file.**

## Step 2 — Create the adapter file

Create `lib/providers/{platform-name}.js`. It **must** export exactly these
functions (see `lib/providers/shortdramavid.js` as the reference
implementation):

```js
module.exports = {
  search,          // (q, provider) => Array<DramaSummary>
  detail,          // (provider, id) => DramaDetail
  allepisode,      // (provider, id) => { bookId, bookName, cover, totalEpisodes, episodes }
  subtitles,       // (provider, id, ep) => Array
  languages,       // (provider) => { default, languages }
  stream,          // (provider, id, ep) => { videoUrl, locked, episodeNumber, qualityList }
  browse,          // (provider) => Array<DramaSummary>
  trending,        // (provider) => Array<DramaSummary>
  latest,          // (provider) => Array<DramaSummary>
  vip,             // (provider) => Array<DramaSummary>
  dubindo,         // (provider) => Array<DramaSummary>
  foryou,          // (provider, page) => { items, page, perPage, total, hasMore }
  notifications,   // () => Array
  hlsManifestUrl,  // (provider, id, ep) => string (server-side only, may contain secrets)
};
```

If a feature doesn't exist on the new platform's real API, still export the
function — return an empty array/object (or, for `hlsManifestUrl`, throw a
clear error) so the shared routes in `server.js` never crash. Do not remove
routes or make functions conditional; keep the platform-agnostic contract
intact.

### Shapes to follow

`DramaSummary` (used by search/trending/latest/vip/dubindo/foryou/browse):
```js
{ id, title, cover, provider, episodes /* count, number */, description }
```

`DramaDetail` (used by `detail`):
```js
{ id, title, cover, description, totalEpisodes, episodes /* array */, provider }
```

`episodes` array item (from `allepisode`, and reused by `detail`):
```js
{ number, title, locked, duration }
```

Normalize every list response through one small internal helper (see
`normalizeSearchItem` in the reference adapter) instead of repeating field
mapping in every function — this is what keeps the adapter maintainable.

### Security rule for API keys (non-negotiable)

- Read secrets only from `process.env`, never hardcode them.
- `buildUrl()`-style helpers may embed the key in upstream request URLs —
  that's fine, because those URLs are only ever fetched **server-side**.
- `stream()` must NOT return a raw upstream URL containing the key. Return
  an internal route path instead (`/api/hls-stream/:provider/:id?ep=N`,
  already implemented generically in `server.js` — it calls
  `adapter.hlsManifestUrl()` server-side and rewrites segment URLs through
  the key-free `/hls-proxy` route). Reuse this existing route; don't build a
  new one per platform.
- Never let error messages reaching the client contain a raw upstream URL.
  Use `lib/fetcher.js`'s `fetchJSON` (it already redacts `api_key`/`token`/
  `secret`/`password` query params before throwing) and `server.js`'s
  `redactSecrets()` helper — both are shared, don't duplicate this logic in
  the adapter.

## Step 3 — Register the platform

Add an entry to `lib/config.js`:

```js
const PLATFORMS = {
  dramabox: { /* ...existing... */ },
  newplatform: {
    id: "newplatform",
    label: "Human Readable Name",
    adapterPath: "./lib/providers/newplatform.js",
    providers: [
      { id: "newplatform", label: "Human Readable Name" },
    ],
  },
};
```

A single adapter can back multiple `providers` entries if the upstream API
serves several sub-catalogs through the same endpoints with a different
`provider` path segment — pass that value straight to your adapter's
`buildUrl`.

## Step 4 — Restart and smoke-test

Restart the `Start application` workflow, then curl each route with the new
platform: `/api/config`, `/api/search`, `/api/drama/:provider/:id`,
`/api/allepisode`, `/api/watch`, `/api/hls-stream`, `/api/trending`,
`/api/latest`, `/api/vip`, `/api/dubindo`, `/api/foryou`. No frontend changes
are needed — `public/js/home.js`'s `ROWS` array and `loadForYou()` already
call these routes generically per platform/provider selected in the UI.

## What you should NOT need to touch

- `public/` (frontend) — it is fully platform-agnostic; it only knows about
  the generic `/api/*` routes and renders whatever `/api/config` reports.
- `server.js` — routes are generic and dispatch through `getAdapter(platform)`;
  add a route here only if the new platform exposes a genuinely new feature
  that no existing route covers.
- `lib/fetcher.js` — shared HTTP helper with retry/timeout/redaction; reuse
  it, don't write a second fetch wrapper.

## Reference

Full working example: `lib/providers/shortdramavid.js` (DramaBox platform,
upstream `priv-api.anichin.bio`, uses `ANICHIN_API_KEY`). Read it end to end
before writing a new adapter — it demonstrates every pattern above,
including the `detail`+`allepisode` merge and the `hlsManifestUrl`
server-side-only pattern.
