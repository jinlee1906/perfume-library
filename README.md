# Jin's Perfumery Library

A reference site for my perfumery raw materials, built from my spreadsheet.
Phase 1: it shows only what's in the spreadsheet, plus a few clearly marked values Claude filled in.

## Run it

```bash
npm install        # first time only
npm run dev        # then open http://localhost:5173
```

The site opens on the film at `/`; **enter** leads to the lobby (`/lobby`). The ingredient list is at
`/ingredients` (old links to `/?q=...` still find it).

## Update the data

1. Edit `data/ingredients.xlsx` (this copy is the master; the one in Downloads is no longer used).
2. Save and close it, then run:

```bash
npm run import
```

The import rewrites `src/data/ingredients.json` and prints a summary of problems
(invalid CAS numbers, missing prices, duplicates and so on), then re-learns from the
published formulas (see **Formulary** below). If the dev server is running, the page
refreshes by itself.

Tips:
- Format the CAS column as **Text** in Excel, or Excel will turn numbers like 8014-09-3 into dates.
- Separate synonyms with semicolons (`Methyl dihydrojasmonate; Hedione`), since chemical names contain commas.
- New columns are picked up automatically. Ones the import doesn't recognise show under
  "Other columns" on the detail page. Recognised names are listed at the top of `scripts/import.mjs`.

## Where things are

| Path | What it is |
|---|---|
| `data/ingredients.xlsx` | Your spreadsheet |
| `data/filled-in.json` | Sources for values Claude researched (CAS, IFRA limits, category, odor family, synonyms). Shown under each value on the site; a value in it is only used if your spreadsheet cell is empty. |
| `scripts/import.mjs` | Spreadsheet → JSON, with cleaning and checks |
| `src/types.ts` | The data shape, including empty slots for later phases |
| `data/formulas.json` | Your saved formulas |
| `src/pages/` | The pages: ingredient list and detail, formulary and published formula, Jin's formula list and editor |
| `data/reference-formulas/` | Published formulas, one file per source (Fraterworks so far), with links back to each one |
| `data/formula-aliases.json` | Hand-checked matches between formula ingredient names and Jin's library, each with a reason |
| `scripts/learn-formulas.mjs` | Links formulas to the library and learns roles and pairings (part of `npm run import`) |
| `src/formulary.ts` | Helpers for the formulary pages and the ingredient page sections |
| `src/pairings.ts` | Pairing suggestions: learned from formulas first, odor-family rules as a fallback |
| `formulas-api.ts` | The small dev-server API that saves formulas |
| `src/styles.css` | All styling. The colours and fonts are at the top. Each colour is `light-dark(light mode, dark mode)`: warm white/hot pink and black/gold. Headings use Bodoni Moda, reading text Jost, numbers and labels DM Mono |
| `src/families.ts` | The 22 odor families, folded into the 8 scent groups that carry colour |
| `scripts/film/`, `public/` | The shaders that draw the films and seals, and the finished files (see **The look**) |
| `src/components/ThemeToggle.tsx` | The light/dark button in the header (follows your system setting until you click it) |

## Filled-in values

Values in `data/filled-in.json` appear with a dashed underline and a "filled in" badge, plus a source link.
- **CAS numbers** were checked against PubChem and pass the check digit.
- **IFRA limits** (Category 4, fine fragrance) come from your suppliers' IFRA certificates (Fraterworks, PerfumersWorld)
  or IFRA's official Standards Library. Where your sheet already has a value, the detail page shows what it was checked against.
- **Category and odor family** come from Claude's general knowledge and have not been checked against a reference.
- **Synonyms** are only included when PubChem lists them for that CAS number.
- **Usage rates, prices, sizes and suppliers are never filled in.**

To accept a filled-in value, type it into your spreadsheet. Your value always wins.

On 6 Oct 2026 all filled-in values were copied into the spreadsheet (IFRA in column C, CAS in G, and new
columns H–J for category, odor family and synonyms). `filled-in.json` still holds their sources, which the
detail page shows under each CAS number and IFRA limit.

## Prices

PerfumersWorld adds a $0.90 packaging fee per bottle. Your cost per gram for those rows leaves the fee out,
and the import recognises that: `(cost − $0.90) ÷ size`. The fee is set in `PACKAGING_FEES` in `scripts/import.mjs`.

## Formulas

Open **Formulas** in the top bar, then **New formula** (or **Start a formula with this** on any ingredient page).

- Add ingredients from the panel on the right, which lists your whole library (search by name, odor family or CAS).
- Type the weight in grams for each one. The site works out % of formula, cost (from your cost per gram), and the total.
- Enter the **concentration in the finished product** (e.g. 20 for an EdP) to turn on the IFRA check. Each line shows its %
  in the finished product against its Category 4 limit, and how much of the formula it could be at most.
  The check looks at each ingredient on its own; restricted materials that come from several ingredients add up, and it
  doesn't add those. Treat it as a first pass, not a certificate.
- **Suggested pairings** (the second tab in the panel) lists ingredients from Jin's library that perfumers most often use
  with what's in the formula, learned from the published formulas. Ingredients no formula uses fall back to odor-family
  rules (in `src/pairings.ts`; edit them freely).

Formulas save automatically to `data/formulas.json` (the previous version is kept in `data/formulas.backup.json`).
Saving only works while the site is running with `npm run dev`.

## Formulary (published formulas)

**Formulary** in the top bar lists every published formula and accord, with how many of its materials Jin already has.
Each formula page shows the formula as published, marks each line ✓ (in the library), ≈ (the same material in another
grade, dilution or trade name; a line at a different dilution from Jin's bottle is always ≈, so check the amounts) or
"Not in library", links to the source, and has **Copy into Jin's formulas**. Tick **Ready to
make** to see only formulas whose every material is in Jin's library. A Basenotes
thread, when a formula has one, is linked directly underneath the formula.

Every ingredient page uses the same data:
- **Usage in published formulas**: how many formulas use it, its typical share of a perfume, and its *role*
  (Backbone ≥10%, Main note 3–10%, Supporting 0.5–3%, Accent 0.05–0.5%, Trace below that; these bands are this site's
  convention). This is what published formulas do, not a recommended amount; IFRA limits still apply.
- **Pairs well with**: library ingredients most often used together with it. The score is the number of shared formulas,
  scaled so very common materials don't top every list.
- **Formulas and accords** that use it.

### Sources

All read on 2026-10-14/16/18. Only ingredient lists and amounts are copied; every formula links back to its source.

| Source | What | Notes |
|---|---|---|
| **Fraterworks** | 128 demonstration formulas (perfumes, a few accords and home fragrances) | Read from their PDFs; 6 scans read with OCR and checked by eye. 15 PDFs print a total that differs from their lines (noted on the page). |
| **Firmenich** (dsm-firmenich) | 51 demonstration formulas from the free *Sharing Innovation* brochures (2016, 2019, 2022, 2023, 2024, 2025) | Each links to its PDF page and adds up to the printed 1000. Candles, shower gels, softeners and the like are marked "Home & body". Where a page prints several versions side by side, the version with the featured ingredient is included and the others are described in its note. |
| **PerfumerHQ** | 46 accords and bases | Parts per 1000; every one adds up to its printed total. |
| **Scent Inventory** | 22 educational accords | Percentages; three add up to less than 100% on the site itself. |
| **Dupe Hacking** | 8 community accords (fragrance.drama), credited in each style line | Their robots.txt allows AI use with citation. Their other accords need an account or purchase. |

Not included: **Basenotes** (a "verify you are human" check Claude isn't allowed to complete), **The Good Scents
Company** (its robots.txt asks Claude's crawlers not to use the site), **PerfumeDoc** (robots.txt blocks all
crawlers), **PerfumersWorld** formulas (sold, never disclosed), **Creative Formulas** and **Perfumer Archive** (paid or
behind a sign-up).

### Supplier notes

`data/supplier-profiles.json` holds facts from the suppliers' product pages for 153 of the 157 rows: Fraterworks (note
classification, average use, odour family, longevity) and PerfumersWorld (odour profile, typical use from/average/maximum
in a compound, odour life, relative impact, usage keywords, "blends well with"). They show as **Character and purpose**
on each ingredient page, and the "blends well with" lists are a second tier of pairing suggestions after the formulas.

### Adding formulas (so the site keeps learning)

Add a file to `data/reference-formulas/` (or add to an existing one), then run `npm run import`. The format:

```json
{
  "source": "Basenotes",
  "sourceUrl": "https://basenotes.com/forums/",
  "about": ["Where these came from and when."],
  "formulas": [
    {
      "id": "bn-simple-jasmine",
      "title": "Simple jasmine accord",
      "kind": "accord",
      "style": "a jasmine accord",
      "smellsLike": null,
      "year": null,
      "url": "https://basenotes.com/threads/...",
      "article": null,
      "thread": "https://basenotes.com/threads/...",
      "unit": "parts",
      "printedTotal": null,
      "lines": [{ "name": "Hedione", "amount": 370 }, { "name": "Indole 1%", "amount": 12 }]
    }
  ]
}
```

`kind` is `perfume`, `accord` or `home`. Write dilutions into the name ("Indole 1%") or a `"dilution": "1%"` field.
`thread` is the Basenotes link shown under the formula; an optional `note` (e.g. other versions printed beside it)
is shown under the formula too. Then check the matches with:

```bash
npm run learn
```

It lists every formula name → library match and the most common names that didn't match. If a name should match one
of Jin's ingredients (or must *not* match), add it to `data/formula-aliases.json` with the reason.

## The look

A silent film in a ruled ledger. The entry gate and ruled inner pages borrow their structure from Orto Parisi's
site: a looping clip tiled across the screen, "enter", a three-column lobby, a manifesto band, a row of round
textures. Nothing of theirs is used: every film, image and word here is original.

**Scent groups.** Colour means one thing on this site. The 22 odor families fold into 8 scent groups (`src/families.ts`),
each with one colour (`--g-*` in `src/styles.css`), and a page about an ingredient takes on its group's colour. The
colours and their order were checked with a colour-blindness validator in both light and dark mode, so re-check them if
you change either. They're for marks and fills, never for text.

**Formula bars.** Each formula's bar shows its share in each scent group, going by the odor family of the matching
library ingredient, with grey for what isn't in Jin's library and for solvents. The formula sheet is the full table.

### The film

The films and seals in `public/` are drawn by small shaders in `scripts/film`: no photographs, no footage from anywhere.

| File | What it draws | Where it plays |
|---|---|---|
| `sillage.frag` | A snail with a stoppered flask for a shell, leaving a silver trail and a thread of scent (a sillage) | The gate, tiled |
| `shelf.frag` | A tracking shot along shelves of bottles labelled with real names from the library | Lobby: Ingredients |
| `ledger.frag` | A book of formulas riffling over by itself | Lobby: Formulary |
| `drop.frag` | A dropper letting one drop fall into a beaker of oil | Lobby: Jin's formulas |
| `seals.frag` | A macro texture for each odor family | Everywhere |

To re-render one, you need Python with numpy and Pillow. Start the renderer and open it in a browser:

```bash
node scripts/film/serve.mjs   # then open http://localhost:5199/scripts/film/render.html
```

In that page's console (each loop takes under a minute):

```js
await film.renderLoop({ prefix: "sillage", frames: 32, w: 960, h: 720, spp: 160 });
await film.renderLoop({ prefix: "shelf", shader: "./shelf.frag", frames: 64, w: 640, h: 800, spp: 96, shutter: 0.25 });
await film.renderLoop({ prefix: "ledger", shader: "./ledger.frag", frames: 32, w: 640, h: 800, spp: 128 });
await film.renderLoop({ prefix: "drop", shader: "./drop.frag", frames: 40, w: 640, h: 800, spp: 96, shutter: 0.25 });
await film.renderSeals({ size: 640, spp: 64 });
```

Then develop the raw frames into old film stock, which writes the files in `public/`:

```bash
python3 scripts/film/assemble.py loop sillage 32 960 720
python3 scripts/film/assemble.py door shelf 64 640 800
python3 scripts/film/assemble.py door ledger 32 640 800
python3 scripts/film/assemble.py door drop 40 640 800
python3 scripts/film/assemble.py seals
```

Anyone whose system asks for reduced motion gets the still frames instead.

## The hosted site

The site is published on GitHub Pages at **https://jinlee1906.github.io/perfume-library/**, from the
`jinlee1906/perfume-library` repository. Every push to `main` rebuilds and republishes it
(`.github/workflows/pages.yml`, about a minute; follow it in the repo's Actions tab). To publish changes:

```bash
git add -A
git commit -m "What changed"
git push
```

Things that work differently on the hosted site:
- **Jin's formulas** save in the browser, on that device only, because GitHub Pages can't write files. On this Mac,
  with `npm run dev`, they still save to `data/formulas.json`, which is kept out of the repository.
- GitHub Pages serves `404.html` for addresses it doesn't know, and the workflow makes that a copy of the site, so links
  like `/perfume-library/ingredient/hedione` open the right page.

The formulary shows other people's published formulas: ingredient lists and amounts only, each credited and linked to
its source. If a source asks for its formulas to come down, delete its file in `data/reference-formulas/`, run
`npm run import`, and push.
