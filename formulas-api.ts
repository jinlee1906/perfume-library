// A tiny API on the Vite dev server that reads and writes data/formulas.json.
//   GET /api/formulas  -> { formulas: [...] }
//   PUT /api/formulas  -> replaces the file with the posted { formulas: [...] }
// It only exists while `npm run dev` is running. Before each write, the previous
// file is copied to data/formulas.backup.json.

import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

const FILE = path.resolve("data/formulas.json");
const BACKUP = path.resolve("data/formulas.backup.json");
const MAX_BYTES = 5_000_000;

export default function formulasApi(): Plugin {
  return {
    name: "formulas-api",
    configureServer(server) {
      server.middlewares.use("/api/formulas", (req, res) => {
        const reply = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(body));
        };

        if (req.method === "GET") {
          const text = fs.existsSync(FILE) ? fs.readFileSync(FILE, "utf8") : '{"formulas":[]}';
          res.setHeader("Content-Type", "application/json");
          res.end(text);
          return;
        }

        if (req.method === "PUT") {
          let body = "";
          req.on("data", (chunk) => {
            body += chunk;
            if (body.length > MAX_BYTES) req.destroy();
          });
          req.on("end", () => {
            let data: { formulas?: unknown };
            try {
              data = JSON.parse(body);
            } catch {
              return reply(400, { error: "Not valid JSON" });
            }
            if (!Array.isArray(data.formulas)) return reply(400, { error: "Expected { formulas: [...] }" });
            // Keep the previous version, then write via a temp file so a crash can't leave half a file.
            if (fs.existsSync(FILE)) fs.copyFileSync(FILE, BACKUP);
            fs.writeFileSync(FILE + ".tmp", JSON.stringify({ formulas: data.formulas }, null, 2) + "\n");
            fs.renameSync(FILE + ".tmp", FILE);
            reply(200, { ok: true });
          });
          return;
        }

        reply(405, { error: "Use GET or PUT" });
      });
    },
  };
}
