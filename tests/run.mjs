// Ejecuta las pruebas en Node (18 o superior):  node tests/run.mjs
import { run } from './all.js';

const results = await run();
let suite = '';
for (const r of results) {
  if (r.suite !== suite) { suite = r.suite; console.log(`\n${suite}`); }
  console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : `\n      ${r.error}`}`);
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${failed ? `✗ ${failed} de ${results.length} pruebas fallan` : `✓ ${results.length} pruebas superadas`}`);
process.exit(failed ? 1 : 0);
