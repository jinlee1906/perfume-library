// The formulary (/formulary): every published formula, as a grid of cards.
// Search by name, "smells like" or ingredient; filter by kind; sort by how much of a
// formula Jin can make from the library. Filters live in the URL, like the ingredient list.

import { Link, useSearchParams } from "react-router";
import { ingredientsById } from "../data";
import FormulaCard from "../components/FormulaCard";
import { ScentLegend } from "../components/ScentBar";
import { coverage, formulary, formulasUsing, kindLabel, publishedFormulas } from "../formulary";
import type { PublishedFormula } from "../types";

type Sort = "makeable" | "name" | "year";

export default function Formulary() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const kind = params.get("kind") ?? "";
  const sort = (params.get("sort") as Sort) ?? "makeable";
  const ready = params.get("ready") === "1"; // only formulas Jin can make in full
  const uses = ingredientsById.get(params.get("uses") ?? ""); // only formulas with this ingredient
  const usingIds = uses ? new Set(formulasUsing(uses.id).map((f) => f.id)) : null;

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const needle = q.trim().toLowerCase();
  const matches = (f: PublishedFormula) =>
    !needle ||
    f.title.toLowerCase().includes(needle) ||
    (f.smellsLike ?? "").toLowerCase().includes(needle) ||
    (f.style ?? "").toLowerCase().includes(needle) ||
    f.lines.some((l) => l.name.toLowerCase().includes(needle));

  const shown = publishedFormulas
    .filter((f) => !usingIds || usingIds.has(f.id))
    .filter((f) => !kind || f.kind === kind)
    .filter(matches)
    .map((f) => ({ f, c: coverage(f) }))
    .filter(({ c }) => !ready || (c.total > 0 && c.owned === c.total))
    .sort((a, b) => {
      if (sort === "name") return a.f.title.localeCompare(b.f.title);
      if (sort === "year") return yearOf(b.f) - yearOf(a.f) || a.f.title.localeCompare(b.f.title);
      return b.c.owned / b.c.total - a.c.owned / a.c.total || a.f.title.localeCompare(b.f.title);
    });

  const kinds = [...new Set(publishedFormulas.map((f) => f.kind))];

  return (
    <>
      <title>Formulary · Jin's Perfumery Library</title>
      <header className="page-intro">
        <div>
          <p className="eyebrow">Formulary</p>
          <h1>
            Published <em>formulas</em>
          </h1>
        </div>
        <p className="lede">
          {publishedFormulas.length} formulas and accords from{" "}
          {formulary.sources.map((s, n) => (
            <span key={s.source}>
              {n > 0 && ", "}
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.source}
              </a>
            </span>
          ))}
          , linked to Jin's library. Each one shows how many of its materials Jin already has.
        </p>
      </header>

      <div className="controls">
        <label className="control control-search">
          <span>Search</span>
          <input type="search" value={q} onChange={(e) => set("q", e.target.value)} placeholder="Name, “smells like” or an ingredient" />
        </label>
        <label className="control">
          <span>Kind</span>
          <select value={kind} onChange={(e) => set("kind", e.target.value)}>
            <option value="">All</option>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {kindLabel[k]}s
              </option>
            ))}
          </select>
        </label>
        <label className="control control-check">
          <span>Show</span>
          <span className="check">
            <input type="checkbox" checked={ready} onChange={(e) => set("ready", e.target.checked ? "1" : "")} />
            Ready to make
          </span>
        </label>
        <label className="control">
          <span>Sort by</span>
          <select value={sort} onChange={(e) => set("sort", e.target.value === "makeable" ? "" : e.target.value)}>
            <option value="makeable">Most makeable</option>
            <option value="name">Name (A–Z)</option>
            <option value="year">Year (newest)</option>
          </select>
        </label>
      </div>

      <p className="result-count">
        Showing {shown.length} of {publishedFormulas.length}
        {uses && (
          <>
            {" "}
            that use{" "}
            <Link to={`/ingredient/${uses.id}`}>{uses.name.trim()}</Link>{" "}
            <button type="button" className="button-icon" onClick={() => set("uses", "")} aria-label="Show all formulas">
              ✕
            </button>
          </>
        )}
      </p>

      <div className="legend-band">
        <span className="eyebrow">What each one is made of</span>
        <ScentLegend />
      </div>

      {shown.length === 0 ? (
        <p className="empty">No formulas match.</p>
      ) : (
        <div className="card-grid">
          {shown.map(({ f }) => (
            <FormulaCard key={f.id} formula={f} />
          ))}
        </div>
      )}

      <Caveats />
    </>
  );
}

/** "c. 1970s" -> 1970, "2019" -> 2019, unknown -> 0 */
function yearOf(f: PublishedFormula): number {
  const m = /\d{4}/.exec(f.year ?? "");
  return m ? Number(m[0]) : 0;
}

/** What to keep in mind before making any published formula. */
export function Caveats() {
  return (
    <aside className="caveats">
      <p className="eyebrow">Before making one</p>
      <ul>
        <li>
          These are published as guides, used at the maker's own risk, and haven't been checked for IFRA compliance. Use Jin's
          formula builder to check the limits.
        </li>
        <li>
          Some historic formulas use materials that are now banned or restricted, for example musk ambrette (prohibited by
          IFRA), or Lyral and Lilial (no longer allowed in EU cosmetics).
        </li>
        <li>Amounts are copied exactly as published. ≈ marks a material Jin has in another grade, dilution or trade name.</li>
      </ul>
    </aside>
  );
}
