// One published formula (/formulary/:id), laid out like a formula sheet: every line as
// published, whether Jin has it, and a button to copy it into Jin's formula builder.

import { Link, useNavigate, useParams } from "react-router";
import { SourceLinks } from "../components/FormulaCard";
import { TallScentBar } from "../components/ScentBar";
import { groupOf } from "../families";
import { coverage, formatShare, ingredientsFor, kindLabel, publishedById, smellsLikeText } from "../formulary";
import { newFormula, useFormulas } from "../formulas";
import { Caveats } from "./Formulary";
import type { Ingredient, PublishedFormula, PublishedLine } from "../types";

export default function PublishedFormulaPage() {
  const { id } = useParams();
  const formula = id ? publishedById.get(id) : undefined;
  if (!formula) {
    return (
      <div className="page">
        <Link className="back" to="/formulary">
          ← Formulary
        </Link>
        <h1>Formula not found</h1>
      </div>
    );
  }
  const f = formula;
  const c = coverage(f);

  return (
    <article className="published">
      <title>{`${f.title} · Formulary`}</title>
      <header className="page-intro">
        <div>
          <Link className="back" to="/formulary">
            ← Formulary
          </Link>
          <p className="eyebrow">
            {kindLabel[f.kind]} · {f.source}
            {f.year && ` · ${f.year}`}
          </p>
          <h1>{f.title}</h1>
        </div>
        <div>
          {f.style && <p className="lede">{f.style}</p>}
          {f.smellsLike && <p className="muted">{smellsLikeText(f.smellsLike)}</p>}
          <SourceLinks formula={f} />
        </div>
      </header>

      <TallScentBar formula={f} />

      <div className="stat-row">
        <div className="stat">
          <span className="stat-value">
            {c.owned}/{c.total}
          </span>
          <span className="stat-label">materials Jin has</span>
        </div>
        <div className="stat">
          <span className="stat-value">{c.exact}</span>
          <span className="stat-label">the exact product</span>
        </div>
        <div className="stat">
          <span className="stat-value">{c.owned - c.exact}</span>
          <span className="stat-label">≈ same material, other grade</span>
        </div>
        <div className="stat stat-action">
          <CopyButton formula={f} />
        </div>
      </div>

      <div className="sheet-wrap">
      <table className="sheet">
        <thead>
          <tr>
            <th scope="col">Ingredient (as published)</th>
            <th scope="col" className="num">
              {unitLabel(f.unit)}
            </th>
            <th scope="col" className="num">
              % of total
            </th>
            <th scope="col">In Jin's library</th>
          </tr>
        </thead>
        <tbody>
          {f.lines.map((l, n) => (
            <tr key={n} className={l.solvent ? "row-solvent" : l.ingredientIds.length ? "row-owned" : undefined}>
              <td data-label="Ingredient">
                {l.name}
                {l.dilution && <span className="tag">{l.dilution}</span>}
                {l.solvent && <span className="tag">solvent</span>}
              </td>
              <td data-label={unitLabel(f.unit)} className="num">
                {l.amount}
              </td>
              <td data-label="% of total" className="num">
                {formatShare(l.percent)}
              </td>
              <td data-label="In Jin's library">
                <LibraryCell line={l} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Total</th>
            <td className="num">{f.total}</td>
            <td className="num hide-mobile">100%</td>
            <td className="hide-mobile" />
          </tr>
        </tfoot>
      </table>
      {f.totalNote && <p className="muted small">{f.totalNote}</p>}
      {f.note && <p className="muted small">{f.note}</p>}
      </div>

      {/* A Basenotes discussion goes directly underneath the formula. */}
      {f.thread && (
        <p className="thread-under">
          Discussed on Basenotes:{" "}
          <a href={f.thread} target="_blank" rel="noreferrer">
            {f.thread.replace(/^https?:\/\/(www\.)?/, "")} ↗
          </a>
        </p>
      )}

      <Caveats />
    </article>
  );
}

/** Column heading for the published amounts. */
function unitLabel(unit: string): string {
  if (unit === "g") return "Grams";
  if (unit === "%") return "Share (%)";
  return unit.charAt(0).toUpperCase() + unit.slice(1); // "parts" -> "Parts"
}

function LibraryCell({ line: l }: { line: PublishedLine }) {
  if (l.solvent) return <span className="muted">—</span>;
  const owned = ingredientsFor(l.ingredientIds);
  if (!owned.length) return <span className="muted">Not in library</span>;
  const unique = [...new Map(owned.map((i) => [i.name.trim(), i])).values()];
  return (
    <span data-group={groupOf(owned[0].odorFamily)?.id}>
      <span className="swatch" aria-hidden="true" />
      <span className={l.match === "exact" ? "ok" : "approx"} title={l.match === "exact" ? "The same product" : "The same material in another grade, dilution or trade name"}>
        {l.match === "exact" ? "✓" : "≈"}
      </span>{" "}
      {unique.map((i, n) => (
        <span key={i.id}>
          {n > 0 && " / "}
          <Link to={`/ingredient/${i.id}`}>{i.name}</Link>
        </span>
      ))}
    </span>
  );
}

/** Copies the formula into Jin's formula builder: lines Jin has, with the rest listed in the notes. */
function CopyButton({ formula: f }: { formula: PublishedFormula }) {
  const { saveFormula, status } = useFormulas();
  const navigate = useNavigate();

  const copy = () => {
    const formula = newFormula();
    formula.name = f.title;
    const grams = new Map<string, { ingredient: Ingredient; grams: number }>();
    const missing: string[] = [];
    const approx: string[] = [];
    for (const l of f.lines) {
      if (l.solvent) continue;
      const options = ingredientsFor(l.ingredientIds);
      // Prefer a bottle Jin owns over a wishlist row.
      const ingredient = options.find((i) => !i.wishlist) ?? options[0];
      if (!ingredient) {
        missing.push(`${l.name}: ${l.amount} ${f.unit}`);
        continue;
      }
      if (l.match === "variant") approx.push(`${ingredient.name.trim()} (published as "${[l.name, l.dilution].filter(Boolean).join(" ")}")`);
      const entry = grams.get(ingredient.id) ?? { ingredient, grams: 0 };
      entry.grams += l.amount;
      grams.set(ingredient.id, entry);
    }
    formula.lines = [...grams.values()].map(({ ingredient, grams }) => ({
      ingredientId: ingredient.id,
      ingredientName: ingredient.name,
      grams: Number(grams.toFixed(3)),
    }));
    formula.notes = [
      `Copied from ${f.source}: ${f.title}${f.smellsLike ? ` (smells like ${f.smellsLike})` : ""}.`,
      `Source: ${f.url}`,
      f.thread ? `Basenotes thread: ${f.thread}` : "",
      approx.length ? `\nSame material, other grade or dilution: check the amounts.\n- ${approx.join("\n- ")}` : "",
      missing.length ? `\nNot in Jin's library (left out):\n- ${missing.join("\n- ")}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    saveFormula(formula);
    navigate(`/formulas/${formula.id}`);
  };

  return (
    <button type="button" className="button-primary" onClick={copy} disabled={status === "loading" || status === "error"}>
      Copy into Jin's formulas
    </button>
  );
}
