// Formula editor (/formulas/:id): weights, % of formula, cost and an IFRA check,
// with the ingredient library and pairing suggestions alongside.
// Every change is saved automatically to data/formulas.json.

import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { formatMoney } from "../data";
import { formatLimit, formatPercent, formulaStats, type LineStats } from "../formulaMath";
import { useFormulas } from "../formulas";
import IngredientPicker from "../components/IngredientPicker";
import SaveStatus from "../components/SaveStatus";
import type { Formula, Ingredient } from "../types";

export default function FormulaEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { formulas, status, saveFormula, deleteFormula } = useFormulas();
  const [focusId, setFocusId] = useState<string | null>(null); // grams box to focus after adding

  const formula = formulas.find((f) => f.id === id);
  if (!formula) {
    return (
      <div className="page">
        <Link className="back" to="/formulas">← All formulas</Link>
        <p>{status === "loading" ? "Loading…" : "This formula doesn't exist (it may have been deleted)."}</p>
      </div>
    );
  }

  const stats = formulaStats(formula);
  const currency = stats.lines.find((l) => l.ingredient?.currency)?.ingredient?.currency ?? "USD";
  const inFormula = stats.lines.map((l) => l.ingredient).filter((i): i is Ingredient => i !== undefined);

  // Save a change to this formula.
  const update = (changes: Partial<Formula>) =>
    saveFormula({ ...formula, ...changes, updatedAt: new Date().toISOString() });

  const addIngredient = (ingredient: Ingredient) => {
    update({ lines: [...formula.lines, { ingredientId: ingredient.id, ingredientName: ingredient.name, grams: 0 }] });
    setFocusId(ingredient.id);
  };
  const setGrams = (index: number, grams: number) =>
    update({ lines: formula.lines.map((l, n) => (n === index ? { ...l, grams } : l)) });
  const removeLine = (index: number) => update({ lines: formula.lines.filter((_, n) => n !== index) });

  const duplicate = () => {
    const now = new Date().toISOString();
    const copy = { ...formula, id: `f-${Date.now().toString(36)}`, name: `${formula.name} (copy)`, createdAt: now, updatedAt: now };
    saveFormula(copy);
    navigate(`/formulas/${copy.id}`);
  };
  const remove = () => {
    if (!window.confirm(`Delete "${formula.name}"? This can't be undone.`)) return;
    deleteFormula(formula.id);
    navigate("/formulas");
  };

  return (
    <div className="formula-page">
      <title>{`${formula.name || "Untitled"} · Jin's formulas`}</title>
      <div className="formula-main">
        <div className="formula-topbar">
          <Link className="back" to="/formulas">← All formulas</Link>
          <SaveStatus />
        </div>

        <input
          className="formula-name"
          value={formula.name}
          onChange={(e) => update({ name: e.target.value })}
          aria-label="Formula name"
        />

        <div className="formula-settings">
          <label className="control">
            <span>Concentration in the finished product (%)</span>
            <NumberInput
              value={formula.concentrationPercent}
              onChange={(v) => update({ concentrationPercent: v })}
              placeholder="e.g. 20 for an EdP"
            />
          </label>
          {formula.concentrationPercent !== null && !(formula.concentrationPercent > 0 && formula.concentrationPercent <= 100) && (
            <p className="bad small" role="alert">Enter a percentage between 0 and 100.</p>
          )}
          <p className="muted small">
            Used for the IFRA check: each ingredient's share of this formula × this concentration is compared with its
            Category 4 (fine fragrance) limit.
          </p>
        </div>

        {stats.overLimit > 0 && (
          <div className="callout callout-warn">
            <strong>
              {stats.overLimit} ingredient{stats.overLimit > 1 ? "s are" : " is"} over the IFRA limit
            </strong>{" "}
            at {formula.concentrationPercent}% concentration. Reduce them, or lower the concentration.
          </div>
        )}

        {formula.lines.length === 0 ? (
          <p className="empty">No ingredients yet. Add some from the ingredient list.</p>
        ) : (
          <table className="formula-table">
            <thead>
              <tr>
                <th scope="col">Ingredient</th>
                <th scope="col" className="num">Weight (g)</th>
                <th scope="col" className="num">% of formula</th>
                <th scope="col" className="num">Cost</th>
                <th scope="col" className="col-ifra">IFRA (Cat. 4)</th>
                <th scope="col"><span className="visually-hidden">Remove</span></th>
              </tr>
            </thead>
            <tbody>
              {stats.lines.map((s, index) => (
                <tr key={`${s.line.ingredientId}-${index}`} className={s.ifraStatus === "over" ? "row-over" : undefined}>
                  <td data-label="Ingredient" className="cell-name">
                    {s.ingredient ? (
                      <Link to={`/ingredient/${s.ingredient.id}`} target="_blank" rel="noreferrer">{s.ingredient.name}</Link>
                    ) : (
                      <span title="Not found in Jin's spreadsheet any more">{s.line.ingredientName} ⚠︎</span>
                    )}
                  </td>
                  <td data-label="Weight (g)" className="num">
                    <NumberInput
                      value={s.line.grams}
                      onChange={(v) => setGrams(index, v ?? 0)}
                      autoFocus={focusId === s.line.ingredientId && index === formula.lines.length - 1}
                      ariaLabel={`Weight of ${s.line.ingredientName} in grams`}
                      className="grams-input"
                    />
                  </td>
                  <td data-label="% of formula" className="num">{formatPercent(s.percentOfFormula)}%</td>
                  <td data-label="Cost" className="num">
                    {s.cost !== null ? formatMoney(s.cost, currency) : <span className="missing" title="No price in Jin's spreadsheet">—</span>}
                  </td>
                  <td data-label="IFRA (Cat. 4)"><IfraCell stats={s} /></td>
                  <td className="cell-remove">
                    <button type="button" className="button-icon" onClick={() => removeLine(index)} aria-label={`Remove ${s.line.ingredientName}`}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Total</th>
                <td data-label="Total weight" className="num">{formatPercent(stats.totalGrams)} g</td>
                <td className="num hide-mobile">100%</td>
                <td data-label="Total cost" className="num">
                  {formatMoney(stats.totalCost, currency)}
                  {stats.linesWithoutPrice > 0 && <div className="muted small">{stats.linesWithoutPrice} without price</div>}
                </td>
                <td colSpan={2} className="muted small no-label">
                  {stats.costPerGram !== null && `${formatMoney(stats.costPerGram, currency)} per gram of formula`}
                </td>
              </tr>
            </tfoot>
          </table>
        )}

        <p className="muted small">
          The IFRA check looks at each ingredient on its own. If a restricted material comes from several ingredients
          (for example citral from both lemon oil and pure citral), those amounts add up, and this check doesn't add
          them. Use it as a first pass, not a compliance certificate.
        </p>

        <label className="control">
          <span>Notes</span>
          <textarea rows={4} value={formula.notes} onChange={(e) => update({ notes: e.target.value })} />
        </label>

        <div className="formula-actions">
          <button type="button" onClick={duplicate}>Duplicate</button>
          <button type="button" className="button-danger" onClick={remove}>Delete formula</button>
        </div>
      </div>

      <IngredientPicker inFormula={inFormula} onAdd={addIngredient} />
    </div>
  );
}

/** The IFRA column for one line. */
function IfraCell({ stats: s }: { stats: LineStats }) {
  const limit = s.ifraLimit;
  // "up to 3% of formula": only worth showing when it actually limits the formula
  const maxHint =
    s.maxPercentOfFormula !== null && s.maxPercentOfFormula < 100 ? (
      <div className="small">up to {formatLimit(s.maxPercentOfFormula)}% of formula</div>
    ) : null;
  switch (s.ifraStatus) {
    case "no-limit":
      return <span className="muted">No limit</span>;
    case "unknown":
      return <span className="missing">No IFRA value</span>;
    case "needs-concentration":
      return <span className="muted">Limit {formatLimit(limit!)}%, set concentration</span>;
    case "ok":
      return (
        <span>
          <span className="ok">✓</span> {formatPercent(s.percentInProduct!)}% · limit {formatLimit(limit!)}%
          {maxHint && <div className="muted">{maxHint}</div>}
        </span>
      );
    case "over":
      return (
        <span className="bad">
          ✗ {formatPercent(s.percentInProduct!)}% · limit {formatLimit(limit!)}%
          {maxHint}
        </span>
      );
  }
}

/**
 * A number box that lets you type freely ("0.", "1.2") and only reports
 * numbers back. Empty means null.
 */
function NumberInput({
  value,
  onChange,
  placeholder,
  autoFocus,
  ariaLabel,
  className,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
  autoFocus?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  const [text, setText] = useState(value === null || value === 0 ? "" : String(value));
  // If the value changes from outside (e.g. another tab), show it.
  useEffect(() => {
    const typed = text.trim() === "" ? null : Number(text);
    if (typed !== value && !(typed === null && value === 0)) setText(value === null ? "" : String(value));
  }, [value]);
  return (
    <input
      type="text"
      inputMode="decimal"
      className={className}
      value={text}
      placeholder={placeholder ?? "0"}
      autoFocus={autoFocus}
      aria-label={ariaLabel}
      onChange={(e) => {
        const t = e.target.value.replace(",", ".");
        if (!/^\d*\.?\d*$/.test(t)) return; // digits and one dot only
        setText(t);
        onChange(t === "" || t === "." ? null : Number(t));
      }}
    />
  );
}
