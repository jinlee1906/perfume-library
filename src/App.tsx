// Page layout and routes. The front door (/) is a full-screen film with no header or footer;
// everything else shares the ruled header and footer.

import { useEffect } from "react";
import { Link, NavLink, Outlet, Route, Routes, useLocation } from "react-router";
import { anyFilledIn, data } from "./data";
import Gate from "./pages/Gate";
import Lobby from "./pages/Lobby";
import IngredientList from "./pages/IngredientList";
import IngredientDetail from "./pages/IngredientDetail";
import FormulaList from "./pages/FormulaList";
import FormulaEditor from "./pages/FormulaEditor";
import Formulary from "./pages/Formulary";
import PublishedFormulaPage from "./pages/PublishedFormulaPage";
import ThemeToggle from "./components/ThemeToggle";

export default function App() {
  const { pathname } = useLocation();
  // Start each new page at the top.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <Routes>
      <Route path="/" element={<Gate />} />
      <Route element={<Layout />}>
        <Route path="/lobby" element={<Lobby />} />
        <Route path="/ingredients" element={<IngredientList />} />
        <Route path="/ingredient/:id" element={<IngredientDetail />} />
        <Route path="/formulary" element={<Formulary />} />
        <Route path="/formulary/:id" element={<PublishedFormulaPage />} />
        <Route path="/formulas" element={<FormulaList />} />
        <Route path="/formulas/:id" element={<FormulaEditor />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

function Layout() {
  const imported = new Date(data.importedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to the content
      </a>
      {/* Three ruled cells: links left, wordmark centred, light/dark switch right. */}
      <header className="site-header">
        <nav className="site-nav" aria-label="Main">
          <NavLink to="/ingredients">
            <span className="nav-number">01</span>Ingredients
          </NavLink>
          <NavLink to="/formulary">
            <span className="nav-number">02</span>Formulary
          </NavLink>
          <NavLink to="/formulas">
            <span className="nav-number">03</span>Jin's formulas
          </NavLink>
        </nav>
        <Link to="/lobby" className="site-title">
          <em>Jin's</em> Perfumery Library
        </Link>
        <div className="site-tools">
          <ThemeToggle />
        </div>
      </header>
      <main id="main">
        <Outlet />
      </main>
      <footer className="site-footer">
        <button type="button" className="to-top" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
          Back to top
        </button>
        <div className="footer-columns">
          <p>
            Data imported {imported} from Jin's spreadsheet.
            {anyFilledIn && " Values with a dashed underline were filled in by Claude. Check them before relying on them."}
          </p>
          <p>
            <Link to="/">See the film again</Link>
          </p>
        </div>
        <p className="footer-mark" aria-hidden="true">
          Jin's
        </p>
      </footer>
      <div className="site-grain" aria-hidden="true" />
    </>
  );
}

function NotFound() {
  return (
    <div className="page not-found">
      <title>Page not found · Jin's Perfumery Library</title>
      <p className="eyebrow">Page not found</p>
      <h1>
        This page has <em>evaporated</em>.
      </h1>
      <p>
        <Link to="/ingredients">Go to the ingredient list.</Link>
      </p>
    </div>
  );
}
