// The ingredient list (/ingredients): every row of the spreadsheet, searchable and filterable, as a
// ledger (a table) or a shelf (a grid of seals). The search, filters, sort and view live in the URL
// (?q=...&category=...&family=...&sort=...&view=...), so the browser's back button returns you to
// the same view.

import { Link, useLocation, useSearchParams } from "react-router";
import { anyFilledIn, formatMoney, ingredients, isMixtureNote, shelf } from "../data";
import { Filled, Missing, WarningIcon } from "../components/Markers";
import Seal from "../components/Seal";
import { familyCounts, groupOf, scentGroups } from "../families";
import { mainFamily } from "../pairings";
import type { Ingredient } from "../types";

const NO_CATEGORY = "__none__";

// Category dropdown options, built once from the data.
const categories = [...new Set(ingredients.map((i) => i.category).filter((c): c is string => c !== null))].sort();
const hasUncategorised = ingredients.some((i) => i.category === null);
// The supplier column only appears once the spreadsheet has suppliers in it (each ingredient's own
// page always shows the field).
const anySupplier = ingredients.some((i) => i.supplier !== null);

/** Does this ingredient match the search text? Checks name, synonyms and CAS. */
function matchesSearch(ingredient: Ingredient, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (ingredient.name.toLowerCase().includes(q)) return true;
  if (ingredient.synonyms.some((s) => s.toLowerCase().includes(q))) return true;
  // CAS: "78-70-6", "78706" and "78-70" all find linalool.
  if (/^[\d\s-]+$/.test(q)) {
    const digits = q.replace(/\D/g, "");
    return ingredient.cas.some((cas) => cas.includes(q) || cas.replace(/-/g, "").includes(digits));
  }
  return false;
}

/** Sort by name, or by price with missing prices always at the bottom. */
function compare(sort: string) {
  return (a: Ingredient, b: Ingredient) => {
    if (sort === "price-asc" || sort === "price-desc") {
      if (a.pricePerGram === null) return b.pricePerGram === null ? a.name.localeCompare(b.name) : 1;
      if (b.pricePerGram === null) return -1;
      return sort === "price-asc" ? a.pricePerGram - b.pricePerGram : b.pricePerGram - a.pricePerGram;
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  };
}

export default function IngredientList() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const query = params.get("q") ?? "";
  const category = params.get("category") ?? "";
  const family = params.get("family") ?? "";
  const sort = params.get("sort") ?? "name";
  const view = params.get("view") === "shelf" ? "shelf" : "ledger";

  // Update one URL parameter, leaving the others alone.
  function setParam(key: string, value: string) {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  }

  const shown = ingredients
    .filter((i) => matchesSearch(i, query))
    .filter((i) => !category || (category === NO_CATEGORY ? i.category === null : i.category === category))
    .filter((i) => !family || mainFamily(i.odorFamily) === family)
    .sort(compare(sort));

  return (
    <>
      <title>Ingredients · Jin's Perfumery Library</title>
      <header className="page-intro">
        <div>
          <p className="eyebrow">Library</p>
          <h1>
            Raw <em>materials</em>
          </h1>
        </div>
        <p className="lede">
          {shelf.owned} materials on Jin's shelf and {shelf.wished} on the wishlist, with prices, IFRA limits and
          what published formulas do with each one.
        </p>
      </header>
      <div className="controls">
        <label className="control control-search">
          <span>Search</span>
          <input
            type="search"
            placeholder="Name, synonym or CAS number"
            value={query}
            onChange={(e) => setParam("q", e.target.value)}
          />
        </label>
        <label className="control">
          <span>Category</span>
          <select value={category} onChange={(e) => setParam("category", e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            {hasUncategorised && <option value={NO_CATEGORY}>No category</option>}
          </select>
        </label>
        <label className="control">
          <span>Odor family</span>
          <select value={family} onChange={(e) => setParam("family", e.target.value)}>
            <option value="">All families</option>
            {scentGroups.map((g) => (
              <optgroup key={g.id} label={g.label}>
                {g.families
                  .filter((f) => familyCounts.has(f))
                  .map((f) => (
                    <option key={f} value={f}>
                      {f} ({familyCounts.get(f)})
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="control">
          <span>Sort by</span>
          <select value={sort} onChange={(e) => setParam("sort", e.target.value === "name" ? "" : e.target.value)}>
            <option value="name">Name (A–Z)</option>
            <option value="price-asc">Price per gram (low to high)</option>
            <option value="price-desc">Price per gram (high to low)</option>
          </select>
        </label>
        <div className="control control-view" role="group" aria-label="View">
          <span>View</span>
          <div className="view-switch">
            <button type="button" aria-pressed={view === "ledger"} onClick={() => setParam("view", "")}>
              Ledger
            </button>
            <button type="button" aria-pressed={view === "shelf"} onClick={() => setParam("view", "shelf")}>
              Shelf
            </button>
          </div>
        </div>
      </div>

      <p className="result-count">
        Showing {shown.length} of {ingredients.length} ingredients.{" "}
        {anyFilledIn && (
          <span className="legend">
            <span className="filled">Dashed underline</span> = filled in by Claude, not from Jin's spreadsheet.
          </span>
        )}
      </p>

      {view === "ledger" ? (
        <table className="ingredient-table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Odor family</th>
              <th scope="col">CAS</th>
              <th scope="col">Category</th>
              <th scope="col" className="num">
                Price / g
              </th>
              {anySupplier && <th scope="col">Supplier</th>}
            </tr>
          </thead>
          <tbody>
            {shown.map((i) => (
              <tr key={i.id} data-group={groupOf(i.odorFamily)?.id}>
                <td data-label="Name" className="cell-name">
                  <Seal odorFamily={i.odorFamily} seed={i.id} small />
                  {/* Pass the current filters along so "Back" on the detail page can restore them. */}
                  <Link to={`/ingredient/${i.id}`} state={{ fromSearch: location.search }}>
                    {i.name}
                  </Link>
                  {i.wishlist && <span className="badge">Not bought yet</span>}
                </td>
                <td data-label="Odor family">
                  {i.odorFamily ? <Filled info={i.filled.odorFamily}>{i.odorFamily}</Filled> : <Missing short />}
                </td>
                <td data-label="CAS" className="mono">
                  <CasCell ingredient={i} />
                </td>
                <td data-label="Category">
                  {i.category ? <Filled info={i.filled.category}>{i.category}</Filled> : <Missing short />}
                </td>
                <td data-label="Price / g" className="num">
                  <PriceCell ingredient={i} />
                </td>
                {anySupplier && <td data-label="Supplier">{i.supplier ?? <Missing short />}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ul className="shelf-grid">
          {shown.map((i) => (
            <li key={i.id} data-group={groupOf(i.odorFamily)?.id}>
              <Link to={`/ingredient/${i.id}`} state={{ fromSearch: location.search }} className="shelf-item">
                <Seal odorFamily={i.odorFamily} seed={i.id} />
                <span className="shelf-name">{i.name}</span>
                <span className="shelf-family">{i.odorFamily ?? <Missing />}</span>
                <span className="shelf-facts">
                  <span className="mono">
                    <CasCell ingredient={i} />
                  </span>
                  <span className="mono">
                    <PriceCell ingredient={i} />
                  </span>
                </span>
                {i.wishlist && <span className="badge">Not bought yet</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {shown.length === 0 && <p className="empty">No ingredients match. Try a different search, category or family.</p>}
    </>
  );
}

function CasCell({ ingredient: i }: { ingredient: Ingredient }) {
  if (i.cas.length === 0) {
    return i.casNotes.some(isMixtureNote) ? <span className="muted">Mixture</span> : <Missing short />;
  }
  return (
    <span className="nowrap">
      <Filled info={i.filled.cas}>{i.cas.join(", ")}</Filled>
      {i.casValid === false && <WarningIcon text="This CAS number isn't valid. Open the ingredient for details." />}
    </span>
  );
}

function PriceCell({ ingredient: i }: { ingredient: Ingredient }) {
  if (i.pricePerGram === null) {
    return i.wishlist ? <Missing short /> : (
      <>
        <Missing short />
        <WarningIcon text="No price in Jin's spreadsheet." />
      </>
    );
  }
  return (
    <span className="nowrap">
      {formatMoney(i.pricePerGram, i.currency)}
      {i.priceIsCalculated && <span className="muted" title="Calculated as cost ÷ size"> calc.</span>}
      {i.priceMismatch && <WarningIcon text="Jin's cost per gram doesn't match cost ÷ size. Open the ingredient for details." />}
    </span>
  );
}
