// A tiny local server for the film renderer (see README, "The film").
// Serves the project's files and saves what render.js posts into scripts/film/out.
//   node scripts/film/serve.mjs   then open http://localhost:5199/scripts/film/render.html

import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const OUT = path.join(import.meta.dirname, "out");
fs.mkdirSync(OUT, { recursive: true });

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".frag": "text/plain", ".woff2": "font/woff2", ".png": "image/png" };

http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (req.method === "POST" && url.pathname === "/save") {
      const name = path.basename(url.searchParams.get("name") ?? "");
      if (!name) return res.writeHead(400).end("no name");
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        fs.writeFileSync(path.join(OUT, name), Buffer.concat(chunks));
        res.end("ok");
      });
      return;
    }
    const file = path.join(ROOT, decodeURIComponent(url.pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end("not found");
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream", "Cache-Control": "no-store" });
    fs.createReadStream(file).pipe(res);
  })
  .listen(5199, "127.0.0.1", () => console.log("film renderer on http://localhost:5199/scripts/film/render.html"));
