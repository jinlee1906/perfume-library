// Entry point: mounts the app into index.html.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import App from "./App";
import { FormulasProvider } from "./formulas";
// Fonts, served from the project rather than Google (see the top of styles.css).
import "@fontsource-variable/bodoni-moda/opsz.css"; // with optical sizes: finer hairlines at large sizes
import "@fontsource-variable/bodoni-moda/opsz-italic.css";
import "@fontsource-variable/jost";
import "@fontsource/dm-mono/400.css";
import "@fontsource/dm-mono/500.css";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* On GitHub Pages the site lives under /perfume-library/ (see vite.config.ts). */}
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "") || "/"}>
      <FormulasProvider>
        <App />
      </FormulasProvider>
    </BrowserRouter>
  </StrictMode>,
);
