// Copies the app's libraries out of node_modules into www/vendor so the app
// runs fully offline (no CDN). Run automatically by `npm run build`.
import { cpSync, mkdirSync, rmSync } from 'node:fs';
const out = 'www/vendor';
rmSync(out, { recursive: true, force: true });
mkdirSync(`${out}/core`, { recursive: true });
mkdirSync(`${out}/lang`, { recursive: true });
const nm = 'node_modules';
const files = [
  [`${nm}/@supabase/supabase-js/dist/umd/supabase.js`, `${out}/supabase.js`],
  [`${nm}/tesseract.js/dist/tesseract.min.js`, `${out}/tesseract.min.js`],
  [`${nm}/tesseract.js/dist/worker.min.js`, `${out}/worker.min.js`],
  [`${nm}/tesseract.js-core/tesseract-core-simd-lstm.wasm.js`, `${out}/core/tesseract-core-simd-lstm.wasm.js`],
  [`${nm}/tesseract.js-core/tesseract-core-lstm.wasm.js`, `${out}/core/tesseract-core-lstm.wasm.js`],
  [`${nm}/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz`, `${out}/lang/eng.traineddata.gz`],
];
for (const [from, to] of files) cpSync(from, to);
console.log(`Vendored ${files.length} files into ${out}`);
