// Side panel of the formula editor: every ingredient in your library (searchable),
// plus a tab with suggested pairings for what's already in the formula.

import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { formatMoney, ingredients } from "../data";
import { mainFamily, suggestPairings } from "../pairings";
import Seal from "./Seal";
import type { Ingredient } from "../types";

const categories = [...new Set(ingredients.map((i) => i.category).filter((c): c is string => c !== null))].sort();

interface Props {
  inFormula: Ingredient[]; // ingredients already in the formula
  onAdd: (ingredient: Ingredient) => void;
}

export default function IngredientPicker({ inFormula, onAdd }: Props) {
  const [tab, setTab] = useState<"all" | "pairings">("all");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const inFormulaIds = new Set(inFormula.map((i) => i.id));

  const q = query.trim().toLowerCase();
  const shown = ingredients
    .filter(
      (i) =>
        !q ||
        i.name.toLowerCase().includes(q) ||
        i.synonyms.some((s) => s.toLowerCase().includes(q)) ||
        (i.odorFamily ?? "").toLowerCase().includes(q) ||
        i.cas.some((c) => c.includes(q)),
    )
    .filter((i) => !category || i.category === category)
    .sort((a, b) => a.name.localeCompare(b.name));

  const addButton = (i: Ingredient) =>
    inFormulaIds.has(i.id) ? (
      <span className="muted small nowrap">In formula</span>
    ) : (
      <button type="button" className="button-small" onClick={() => onAdd(i)} aria-label={`Add ${i.name}`}>
        + Add
      </button>
    );

  return (
    <aside className="picker">
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "all"} onClick={() => setTab("all")}>
          All ingredients ({ingredients.length})
        </button>
        <button type="button" role="tab" aria-selected={tab === "pairings"} onClick={() => setTab("pairings")}>
          Suggested pairings
        </button>
      </div>

      {tab === "all" && (
        <>
          <div className="picker-controls">
            <input
              type="search"
              placeholder="Search name, family or CAS"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search ingredients"
            />
            <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <ul className="picker-list">
            {shown.map((i) => (
              <li key={i.id}>
                <Seal odorFamily={i.odorFamily} seed={i.id} small />
                <div className="picker-text">
                  <Link to={`/ingredient/${i.id}`} target="_blank" rel="noreferrer">
                    {i.name}
                  </Link>
                  {i.wishlist && <span className="badge">Not bought yet</span>}
                  <div className="muted small">
                    {i.odorFamily ?? "No odor family"}
                    {i.pricePerGram !== null && ` · ${formatMoney(i.pricePerGram, i.currency)}/g`}
                  </div>
                </div>
                {addButton(i)}
              </li>
            ))}
          </ul>
        </>
      )}

      {tab === "pairings" && <Pairings inFormula={inFormula} addButton={addButton} />}
    </aside>
  );
}

function Pairings({ inFormula, addButton }: { inFormula: Ingredient[]; addButton: (i: Ingredient) => ReactNode }) {
  if (inFormula.length === 0) {
    return <p className="muted picker-empty">Add an ingredient to the formula to see what pairs with it.</p>;
  }
  const suggestions = suggestPairings(inFormula);
  if (suggestions.length === 0) {
    return <p className="muted picker-empty">No suggestions yet for these ingredients.</p>;
  }
  const firstSupplier = suggestions.findIndex((s) => s.basis === "supplier");
  const firstFamily = suggestions.findIndex((s) => s.basis === "family");
  return (
    <>
      <p className="muted small picker-note">
        Ingredients perfumers most often use with what's in this formula, learned from published formulas. A starting
        point, not a rule.
      </p>
      <ul className="picker-list">
        {suggestions.map(({ ingredient: i, reasons, basis }, n) => (
          <li key={i.id} className={n === firstFamily || n === firstSupplier ? "picker-divider" : undefined}>
            <Seal odorFamily={i.odorFamily} seed={i.id} small />
            <div className="picker-text">
              {n === firstSupplier && <p className="eyebrow">Supplier suggestions</p>}
              {n === firstFamily && <p className="eyebrow">By odor family</p>}
              <Link to={`/ingredient/${i.id}`} target="_blank" rel="noreferrer">
                {i.name}
              </Link>
              {i.wishlist && <span className="badge">Not bought yet</span>}
              <div className="muted small">{mainFamily(i.odorFamily)}</div>
              <ul className="reasons">
                {reasons.slice(0, 2).map((r, k) => (
                  <li key={k}>
                    {basis === "family" ? r.why : `With ${r.partners.map((p) => p.name.trim()).join(", ")}: ${r.why}`}.
                  </li>
                ))}
              </ul>
            </div>
            {addButton(i)}
          </li>
        ))}
      </ul>
    </>
  );
}
