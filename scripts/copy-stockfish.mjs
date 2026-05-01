import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const bin = path.join(root, "node_modules", "stockfish", "bin");
const dest = path.join(root, "public", "stockfish");

const files = ["stockfish-18-lite-single.js", "stockfish-18-lite-single.wasm"];

try {
  fs.mkdirSync(dest, { recursive: true });
  for (const f of files) {
    const src = path.join(bin, f);
    if (!fs.existsSync(src)) {
      console.warn(`[copy-stockfish] Skip: missing ${src}`);
      continue;
    }
    fs.copyFileSync(src, path.join(dest, f));
  }
} catch (e) {
  console.warn("[copy-stockfish]", e);
}
