// Loads and saves Jin's formulas. Any page can use `useFormulas()` to read the list or change it;
// changes are saved about half a second after the last edit:
// - on the dev server (`npm run dev`), to data/formulas.json, through formulas-api.ts;
// - on the hosted site, which has no server to write to, in the browser's own storage. Formulas
//   saved there stay in that browser on that device.

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Formula } from "./types";

type SaveStatus = "loading" | "saved" | "saving" | "error";

interface FormulasContextValue {
  formulas: Formula[];
  status: SaveStatus;
  error: string | null;
  saveFormula: (formula: Formula) => void; // add or replace
  deleteFormula: (id: string) => void;
}

const FormulasContext = createContext<FormulasContextValue | null>(null);

const API = "/api/formulas";
const SAVE_DELAY_MS = 500;

/** True on the hosted site: formulas live in this browser rather than in data/formulas.json. */
export const savesInBrowser = !import.meta.env.DEV;
const STORAGE_KEY = "jins-formulas";

async function loadFormulas(): Promise<Formula[]> {
  if (savesInBrowser) {
    const text = localStorage.getItem(STORAGE_KEY);
    return text ? (JSON.parse(text) as { formulas: Formula[] }).formulas : [];
  }
  const res = await fetch(API);
  if (!res.ok) throw new Error(`The server answered ${res.status}`);
  return ((await res.json()) as { formulas: Formula[] }).formulas;
}

async function storeFormulas(formulas: Formula[]): Promise<void> {
  if (savesInBrowser) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ formulas }));
    return;
  }
  const res = await fetch(API, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ formulas }),
  });
  if (!res.ok) throw new Error(`The server answered ${res.status}`);
}

export function FormulasProvider({ children }: { children: ReactNode }) {
  const [formulas, setFormulas] = useState<Formula[]>([]);
  const [status, setStatus] = useState<SaveStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);

  // Load once when the site opens.
  useEffect(() => {
    loadFormulas()
      .then((loaded) => {
        setFormulas(loaded);
        setStatus("saved");
      })
      .catch(() => {
        setStatus("error");
        setError(
          savesInBrowser
            ? "Couldn't read formulas saved in this browser. It may be blocking site storage (a private window does)."
            : "Couldn't load formulas. Saving only works while the site runs with `npm run dev`.",
        );
      });
  }, []);

  // Save the whole list, shortly after the last change.
  const scheduleSave = useCallback((next: Formula[]) => {
    window.clearTimeout(saveTimer.current);
    setStatus("saving");
    saveTimer.current = window.setTimeout(async () => {
      try {
        await storeFormulas(next);
        setStatus("saved");
        setError(null);
      } catch (e) {
        setStatus("error");
        setError(
          savesInBrowser
            ? `Couldn't save in this browser: ${(e as Error).message}.`
            : `Couldn't save: ${(e as Error).message}. Is \`npm run dev\` running?`,
        );
      }
    }, SAVE_DELAY_MS);
  }, []);

  const saveFormula = useCallback(
    (formula: Formula) => {
      setFormulas((current) => {
        const exists = current.some((f) => f.id === formula.id);
        const next = exists ? current.map((f) => (f.id === formula.id ? formula : f)) : [...current, formula];
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  const deleteFormula = useCallback(
    (id: string) => {
      setFormulas((current) => {
        const next = current.filter((f) => f.id !== id);
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  return (
    <FormulasContext.Provider value={{ formulas, status, error, saveFormula, deleteFormula }}>
      {children}
    </FormulasContext.Provider>
  );
}

export function useFormulas(): FormulasContextValue {
  const value = useContext(FormulasContext);
  if (!value) throw new Error("useFormulas must be used inside <FormulasProvider>");
  return value;
}

/** A new, empty formula. */
export function newFormula(): Formula {
  const now = new Date().toISOString();
  return {
    id: `f-${Date.now().toString(36)}`,
    name: "Untitled formula",
    notes: "",
    concentrationPercent: null,
    lines: [],
    createdAt: now,
    updatedAt: now,
  };
}
