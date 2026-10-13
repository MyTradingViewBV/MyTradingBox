// Lists screenshots that differ between two labels.
// Usage: node e2e/screens/compare.mjs before after
// Byte comparison only (no pixelmatch in node_modules); a difference means "look at it".
// Reports DIFF (different bytes), MISSING (only in the first label) and ONLY-B (only in the second).
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const [a, b] = process.argv.slice(2);
const root = process.env.SCREENS_DIR ?? "screens-output";
if (!a || !b) {
  console.error("usage: node e2e/screens/compare.mjs <labelA> <labelB>");
  process.exit(2);
}
for (const label of [a, b]) {
  if (!existsSync(join(root, label)) || !statSync(join(root, label)).isDirectory()) {
    const known = existsSync(root)
      ? readdirSync(root).filter((f) => statSync(join(root, f)).isDirectory())
      : [];
    console.error(
      `Label folder not found: ${join(root, label)}\n` +
        `Available labels in ${root}: ${known.length ? known.join(", ") : "(none)"}\n` +
        "Capture it first: $env:SCREENS_LABEL='<label>'; npm run e2e:screens",
    );
    process.exit(2);
  }
}

const dirs = (label) =>
  readdirSync(join(root, label)).filter((f) => statSync(join(root, label, f)).isDirectory());
const files = (label, vp) =>
  existsSync(join(root, label, vp)) ? readdirSync(join(root, label, vp)) : [];

let same = 0;
let diff = 0;
for (const vp of new Set([...dirs(a), ...dirs(b)])) {
  const inA = files(a, vp);
  const inB = files(b, vp);
  for (const f of inA) {
    if (!inB.includes(f)) {
      console.log(`MISSING ${vp}/${f} (only in ${a})`);
      diff++;
    } else if (readFileSync(join(root, a, vp, f)).equals(readFileSync(join(root, b, vp, f)))) {
      same++;
    } else {
      console.log(`DIFF    ${vp}/${f}`);
      diff++;
    }
  }
  for (const f of inB) {
    if (!inA.includes(f)) {
      console.log(`ONLY-B  ${vp}/${f} (only in ${b})`);
      diff++;
    }
  }
}
console.log(`${same} identical, ${diff} different/missing/extra`);
