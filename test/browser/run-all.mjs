// Runs every browser battery in turn against the checked-out site, exactly as
// CI does. Each script serves the repo root on its own port, stubs the Worker
// API, and drives a real Chromium. Any failure fails the run.
//   npm test              (from the repo root; Playwright's Chromium installed)
//   CHROME=/path/to/chromium npm test   to use a Chromium already on the machine
import { spawnSync } from 'node:child_process';
const scripts = ['site.mjs', 'donate-link.mjs', 'crash.mjs', 'float-cart.mjs', 'refresh.mjs', 'console.mjs'];
let failed = 0;
for (const s of scripts) {
  console.log('\n=== ' + s + ' ===');
  const r = spawnSync(process.execPath, [new URL('./' + s, import.meta.url).pathname], { stdio: 'inherit', env: process.env });
  if (r.status !== 0) failed++;
}
console.log(failed ? '\n' + failed + ' browser batteries FAILED' : '\nALL BROWSER BATTERIES PASSED');
process.exit(failed ? 1 : 0);
