# Tafsir API Server

A Node.js / Express REST API that serves a Quran tafsir (commentary)
dataset straight off disk as JSON — no database required. Built around the
`adwa-al-bayan` sample you provided, but designed to hold **multiple
editions** (different authors, different languages) at once, and to pick
up new ones later without any code changes.

## Data layout it expects

Each **edition** (one author, one language) is a folder that directly
contains, per surah:
- a combined file: `<surah>.json` — an array of every ayah's tafsir in
  that surah, e.g. `[{ "surah": 3, "ayah": 7, "text": "..." }, ...]`
- a matching folder: `<surah>/` with one file per ayah (`<ayah>.json`,
  same shape as one entry above) plus an `empty_ayahs.json` listing which
  ayah numbers in that surah have **no** dedicated commentary (very common
  — in the sample, most ayahs are covered under a nearby ayah's entry
  rather than having their own).

Two folder arrangements are both auto-detected — no configuration needed:

```
data/tafsirs/adwa-al-bayan/...                  <- flat: one edition
data/tafsirs/arabic/adwa-al-bayan/...            <- grouped by language
data/tafsirs/english/ibn-kathir/...              <- another language/author
```

The server looks for numbered surah files/folders (`1.json`, `114.json`,
`1/`, ...) directly inside each top-level folder; if it doesn't find any
there, it checks one level down. That's how both layouts above work
without you having to pick one in advance — just drop each new
author/language folder in and call `POST /api/reload` (or redeploy).

## 1. Install

```bash
npm install
```

## 2. Put your data in place

Extract each tafsir edition into `data/tafsirs/` following one of the two
layouts above.

## 3. Configure

```bash
cp .env.example .env
```

| Variable      | Default              | Meaning                                                    |
|---------------|----------------------|--------------------------------------------------------------|
| `DATA_DIR`    | `./data/tafsirs`     | Folder containing your edition folders (flat or grouped)      |
| `PORT`        | `4001`               | Port the API listens on (most hosts inject this themselves)   |
| `HOST`        | `0.0.0.0`            | Interface to bind to                                          |
| `CORS_ORIGIN` | `*`                  | Comma-separated allowed origins, or `*` for all                |
| `RELOAD_TOKEN`| unset                | If set, `POST /api/reload` requires `?token=...`                |

## 4. Run

```bash
npm start        # production
npm run dev       # auto-restart on file changes (Node 18+)
```

The server never crashes on missing/empty data — if `DATA_DIR` is empty it
still starts, and every `/api/*` route returns a clear `503` explaining
what's missing instead of the process dying. `GET /` and `GET
/api/health` always respond so a host's health check never sees a bare
503 with no explanation.

## Endpoints

| Method | Path                                                                 | Returns                                                        |
|--------|------------------------------------------------------------------------|------------------------------------------------------------------|
| GET    | `/api/health`                                                           | Server status (`ok`/`no_data`), data dir, edition count           |
| POST   | `/api/reload`                                                           | Re-scans `DATA_DIR` without restarting the process                 |
| GET    | `/api/editions`                                                         | All editions (slug, name, language group, surah count)             |
| GET    | `/api/editions/:slug`                                                   | One edition's details                                              |
| GET    | `/api/editions/:slug/surahs`                                            | Every surah in the edition, with ayah counts (with/without tafsir) |
| GET    | `/api/editions/:slug/surahs/:surahNumber`                               | Full tafsir for a surah — every ayah that has commentary            |
| GET    | `/api/editions/:slug/surahs/:surahNumber/ayahs/:ayahNumber`             | One ayah's tafsir, or `{"has_tafsir": false}` if it has none         |
| GET    | `/api/editions/:slug/surahs/:surahNumber/empty-ayahs`                   | Ayah numbers with no dedicated commentary in that surah              |
| GET    | `/api/search?edition=&q=&surah=&limit=&offset=`                        | Text search within an edition (optionally one surah)                  |

`:slug` is a placeholder — replace it with a real slug from
`GET /api/editions` (e.g. `adwa-al-bayan`, or `arabic-adwa-al-bayan` for a
grouped layout).

### Examples

```bash
curl http://localhost:4001/api/editions
curl http://localhost:4001/api/editions/adwa-al-bayan/surahs
curl http://localhost:4001/api/editions/adwa-al-bayan/surahs/3
curl http://localhost:4001/api/editions/adwa-al-bayan/surahs/3/ayahs/7
curl "http://localhost:4001/api/search?edition=adwa-al-bayan&q=التأويل&limit=5"
```

### About `has_tafsir: false`

Most ayahs in this dataset don't have their own dedicated commentary —
their discussion is folded into a nearby ayah's entry. The per-ayah
endpoint reflects that honestly: it's a normal `200` response with
`"has_tafsir": false`, not an error, so your frontend can show "see
commentary on a nearby ayah" instead of treating it as broken.

### Search and Arabic diacritics

The tafsir text is fully vocalized (contains tashkeel/harakat — the small
marks above and below letters). A plain-letter search query like `الله`
won't substring-match `اللَّهِ` unless diacritics are stripped from both
sides first — the search endpoint already does this automatically, so you
can search with or without diacritics and get the same results.

## Deploying on Hostinger

Same approach as any Node app on Hostinger's managed Web App hosting: it
rebuilds from your uploaded zip/repo on every deploy, so your tafsir data
needs to be part of that deploy (inside `data/tafsirs/`) to survive a
rebuild — see this project's sibling `hadith-api-server` README for the
full walkthrough (environment variables, verifying `/api/health`,
`POST /api/reload`); the same steps apply here with `data/tafsirs`
in place of `data/hadith_data`.

## Project layout

```
src/
  server.js                Express app + hardened startup
  config.js                Reads .env
  utils/
    slug.js                 Folder name -> URL slug
    dataStore.js             Discovers editions (flat or grouped); reads
                             surah/ayah files on demand
    arabicNormalize.js        Strips tashkeel/diacritics for search
  routes/
    editions.js               /api/editions... endpoints
    search.js                 /api/search endpoint
```

## Extending this

- Add per-edition metadata (author bio, language code, source URL) by
  dropping an optional `_meta.json` in each edition folder and having
  `dataStore.js` read it in `listEditions()`/`getEdition()`.
- If a future tafsir's ayah text isn't in Arabic, the diacritic-stripping
  in search is harmless (it only touches the specific Arabic diacritic
  Unicode range) but won't help that language — extend
  `arabicNormalize.js` or add a per-language normalizer if needed.
