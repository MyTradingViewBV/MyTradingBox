// Lists screenshots that differ between two labels.
// Usage: node e2e/screens/compare.mjs before after
// Byte comparison only (no pixelmatch in node_modules); a difference means "look at it".
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const [a, b] = process.argv.slice(2);
const root = process.env.SCREENS_DIR ?? "screens-output";
if (!a || !b)
  throw new Error("usage: node e2e/screens/compare.mjs <labelA> <labelB>");
let same = 0;
let diff = 0;
for (const vp of readdirSync(join(root, a))) {
  const dir = join(root, a, vp);
  if (!statSync(dir).isDirectory()) continue;
  for (const f of readdirSync(dir)) {
    const other = join(root, b, vp, f);
    if (!existsSync(other)) {
      console.log(`MISSING ${vp}/${f}`);
      diff++;
    } else if (readFileSync(join(dir, f)).equals(readFileSync(other))) {
      same++;
    } else {
      console.log(`DIFF    ${vp}/${f}`);
      diff++;
    }
  }
}
console.log(`${same} identical, ${diff} different/missing`);
