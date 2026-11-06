// Formulas page (/formulas): every saved formula, and a button to start a new one.

import { Link, useNavigate } from "react-router";
import { formatMoney } from "../data";
import { formatPercent, formulaStats } from "../formulaMath";
import { newFormula, useFormulas } from "../formulas";
import SaveStatus from "../components/SaveStatus";

export default function FormulaList() {
  const { formulas, status, saveFormula } = useFormulas();
  const navigate = useNavigate();

  const create = () => {
    const formula = newFormula();
    saveFormula(formula);
    navigate(`/formulas/${formula.id}`);
  };

  // Most recently edited first.
  const sorted = [...formulas].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <>
      <title>Jin's formulas · Jin's Perfumery Library</title>
      <header className="page-intro">
        <div>
          <p className="eyebrow">Workshop</p>
          <h1>
            <em>Jin's</em> formulas
          </h1>
        </div>
        <div className="page-intro-side">
          <button type="button" className="button-primary" onClick={create} disabled={status === "loading" || status === "error"}>
            + New formula
          </button>
          <p><SaveStatus /></p>
        </div>
      </header>

      {sorted.length === 0 ? (
        status !== "loading" && <p className="empty page">No formulas yet. Start one with “New formula”.</p>
      ) : (
        <table className="ingredient-table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col" className="num">Ingredients</th>
              <th scope="col" className="num">Total weight</th>
              <th scope="col" className="num">Cost</th>
              <th scope="col">IFRA</th>
              <th scope="col">Last edited</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((f) => {
              const stats = formulaStats(f);
              return (
                <tr key={f.id}>
                  <td data-label="Name" className="cell-name"><Link to={`/formulas/${f.id}`}>{f.name || "Untitled"}</Link></td>
                  <td data-label="Ingredients" className="num">{f.lines.length}</td>
                  <td data-label="Total weight" className="num">{formatPercent(stats.totalGrams)} g</td>
                  <td data-label="Cost" className="num">{formatMoney(stats.totalCost, "USD")}</td>
                  <td data-label="IFRA">
                    {stats.overLimit > 0 ? (
                      <span className="bad">{stats.overLimit} over limit</span>
                    ) : f.concentrationPercent && f.concentrationPercent <= 100 ? (
                      <span className="ok">OK at {f.concentrationPercent}%</span>
                    ) : (
                      <span className="muted">Set concentration</span>
                    )}
                  </td>
                  <td data-label="Last edited">{new Date(f.updatedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
