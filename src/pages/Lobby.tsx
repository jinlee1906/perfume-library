// The lobby (/lobby), where "enter" leads: three doors with a little film over each, the house rule,
// a map of the library by scent, and what Jin could make today. Every number here is counted from
// the data.

import { Link } from "react-router";
import FilmLoop from "../components/FilmLoop";
import FormulaCard from "../components/FormulaCard";
import Seal from "../components/Seal";
import { ingredients, shelf } from "../data";
import { familyCounts, scentGroups } from "../families";
import { coverage, publishedFormulas } from "../formulary";
import { useFormulas } from "../formulas";

const readyToMake = publishedFormulas.filter((f) => {
  const c = coverage(f);
  return c.total > 0 && c.owned === c.total;
});

// Names for the band of moving type, in the spreadsheet's own order and without repeats.
const names = [...new Set(ingredients.map((i) => i.name.trim()))];

export default function Lobby() {
  const { formulas, status } = useFormulas();
  const saved =
    status === "loading" || formulas.length === 0
      ? "Weights, cost and an IFRA check for each one"
      : `${formulas.length} saved so far, with weights, cost and an IFRA check`;

  return (
    <div className="lobby">
      <title>Lobby · Jin's Perfumery Library</title>
      <h1 className="visually-hidden">Jin's Perfumery Library</h1>

      <nav className="doors" aria-label="The three parts of the library">
        <Door
          to="/ingredients"
          number="01"
          title="Ingredients"
          film="shelf"
          alt="A film: a tracking shot along shelves of stoppered bottles with paper labels."
          line={`${shelf.owned} materials on Jin's shelf and ${shelf.wished} on the wishlist`}
        />
        <Door
          to="/formulary"
          number="02"
          title="Formulary"
          film="ledger"
          alt="A film: the pages of an open book of formulas riffle over by themselves."
          line={`${publishedFormulas.length} published formulas and accords`}
        />
        <Door
          to="/formulas"
          number="03"
          title="Jin's formulas"
          film="drop"
          alt="A film: a glass dropper lets one drop fall into a beaker of oil, and rings spread across the surface."
          line={saved}
        />
      </nav>

      <div className="marquee" aria-hidden="true">
        <div className="marquee-track">
          {[0, 1].map((copy) => (
            <span key={copy}>
              {names.map((name) => (
                <span key={name} className="marquee-name">
                  {name}
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>

      <section className="house-rule" aria-labelledby="house-rule-title">
        <h2 id="house-rule-title" className="eyebrow">
          The house rule
        </h2>
        <p className="house-rule-big">Nothing here is invented.</p>
        <p>
          If a value isn't in Jin's spreadsheet, it shows as missing. A wrong CAS number or usage rate in perfumery can be
          a safety issue.
        </p>
        <p>Published formulas and supplier notes link back to where they came from.</p>
      </section>

      <section className="scent-map" aria-labelledby="scent-map-title">
        <header className="band-head">
          <h2 id="scent-map-title">The library by scent</h2>
          <p className="muted">
            All {ingredients.length} rows of the spreadsheet, by odor family. Each scent group has a color, and the color
            follows its materials through the site.
          </p>
        </header>
        {scentGroups.map((group) => (
          <div className="scent-row" key={group.id} data-group={group.id}>
            <h3 className="scent-row-name">
              <span className="swatch" aria-hidden="true" />
              {group.label}
            </h3>
            <ul className="scent-row-families">
              {group.families
                .filter((family) => familyCounts.has(family))
                .map((family) => (
                  <li key={family}>
                    <Link to={`/ingredients?family=${encodeURIComponent(family)}`}>
                      <Seal odorFamily={family} />
                      <span className="scent-family">{family}</span>
                      <span className="scent-count">{familyCounts.get(family)}</span>
                    </Link>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </section>

      {readyToMake.length > 0 && (
        <section className="ready-band" aria-labelledby="ready-title">
          <header className="band-head">
            <h2 id="ready-title">Ready to make</h2>
            <p className="muted">
              {readyToMake.length} published accords use only materials in Jin's library.{" "}
              <Link to="/formulary?ready=1">See them in the formulary</Link>
            </p>
          </header>
          <div className="card-grid">
            {readyToMake.map((f) => (
              <FormulaCard key={f.id} formula={f} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Door({ to, number, title, film, alt, line }: { to: string; number: string; title: string; film: string; alt: string; line: string }) {
  return (
    <Link className="door" to={to}>
      <FilmLoop name={film} alt={alt} className="door-film" />
      <span className="door-label">
        <span className="door-number">{number}</span>
        <span className="door-title">{title}</span>
        <span className="door-line">{line}</span>
      </span>
    </Link>
  );
}
