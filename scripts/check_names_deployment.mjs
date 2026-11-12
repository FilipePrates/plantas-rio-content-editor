import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync, mkdirSync, createReadStream, existsSync, statSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright-core';
const stage = process.argv[2] || 'local'; assert.ok(['local', 'cloud-preview', 'live'].includes(stage));
const base = resolve('.local/deploy-finish-20261112');
const directory = join(base, stage === 'local' ? 'local' : 'cloud');
const artifacts = join(base, stage); mkdirSync(artifacts, { recursive: true });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]);
if (stage !== 'local') {
  const files = walk(directory);
  assert.ok(!files.some(file => /(?:catalog\.json|[/\\]photos[/\\]|\.env|\.sql$)/.test(file)));
  for (const file of files) {
    const bytes = readFileSync(file);
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) assert.ok(!bytes.includes(Buffer.from(process.env.SUPABASE_SERVICE_ROLE_KEY)), 'Private service key excluded');
  }
}
let server;
if (stage !== 'live') {
  server = createServer((req, res) => {
    let file = resolve(directory, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (!file.startsWith(directory + '/') && !file.startsWith(directory + '\\') && file !== directory) { res.writeHead(403).end(); return; }
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(directory, 'index.html');
    const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
    res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream'); createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(8895, '127.0.0.1', resolve));
}
const url = stage === 'live' ? 'https://admin.plantas.avesdobrasil.app' : 'http://127.0.0.1:8895';
const errors = [], widths = [];
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, acceptDownloads: true });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(String(error)));
    if (stage === 'cloud-preview') await page.route('**/api/config', route => route.fulfill({ json: { configured: true, url: 'https://example.supabase.co', key: 'test-public-key' } }));
    const response = await page.goto(url, { waitUntil: 'domcontentloaded' }); assert.equal(response.status(), 200);
    if (stage === 'local') {
      const input = page.getByLabel('Nome comum principal (opcional)', { exact: true }); await input.waitFor();
      const scientific = await page.getByLabel('Nome científico (sem autoria)', { exact: true }).inputValue();
      await input.fill(scientific);
      await page.getByRole('button', { name: /Salvar ficha/ }).click();
      await page.getByRole('status').filter({ hasText: 'salvo neste navegador' }).waitFor();
      await page.reload({ waitUntil: 'domcontentloaded' }); await input.waitFor();
      assert.equal(await input.inputValue(), '');
      assert.equal(await page.locator('.pageHeading p').count(), 0);
      assert.equal(await page.locator('h1 i').innerText(), scientific);
      assert.deepEqual(await page.locator('h1 i').evaluate(el => ({ weight: getComputedStyle(el).fontWeight, style: getComputedStyle(el).fontStyle })), { weight: '400', style: 'italic' });
      const downloadEvent = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Exportar JSON', exact: true }).click();
      const download = await downloadEvent; const destination = join(artifacts, `export-${width}.json`); await download.saveAs(destination);
      const exported = JSON.parse(readFileSync(destination, 'utf8'));
      assert.equal(exported.plants.find(plant => plant.scientificName === scientific).commonName, '');
      await input.fill('Nome comum de teste'); await page.getByRole('button', { name: /Salvar ficha/ }).click();
      await page.getByRole('status').filter({ hasText: 'salvo neste navegador' }).waitFor();
      await page.reload({ waitUntil: 'domcontentloaded' }); assert.equal(await input.inputValue(), 'Nome comum de teste');
      if (width === 1440) {
        await input.fill('Alteração sem salvar');
        page.once('dialog', dialog => dialog.dismiss());
        await page.locator('.plantList button').nth(1).click();
        assert.equal(await input.inputValue(), 'Alteração sem salvar');
      }
    } else {
      await page.getByRole('heading', { name: 'Bem-vindo ao editor' }).waitFor();
      await page.getByLabel('Email', { exact: true }).waitFor();
      await page.getByLabel('Senha', { exact: true }).waitFor();
      const html = await response.text();
      const refs = [...html.matchAll(/(?:src|href)="([^"?]+\.(?:js|css|png))"/g)].map(match => match[1]); assert.ok(refs.some(file => file.endsWith('.js')));
      for (const ref of refs) {
        const asset = await context.request.get(new URL(ref, url).href); assert.equal(asset.status(), 200);
        assert.equal(hash(await asset.body()), hash(readFileSync(join(directory, new URL(ref, url).pathname))));
      }
      if (stage === 'live') {
        assert.equal((await context.request.get(url + '/api/catalog')).status(), 401);
        assert.equal((await context.request.get(url + '/photos/inat-123.jpg')).status(), 401);
      }
    }
    await page.screenshot({ path: join(artifacts, `editor-${width}.png`) });
    widths.push(width); await context.close(); console.log(`PASS editor ${stage} ${width}`);
  }
  assert.deepEqual(errors, []);
  const result = { stage, widths, isolatedLocalSaves: stage === 'local', emptyAndRepeatedNamesPersist: stage === 'local', exportRetainsEmptyNames: stage === 'local', unsavedCancellation: stage === 'local', loginAndBranding: stage !== 'local', exactAssetHashes: stage !== 'local', unauthenticatedApiAndMediaRejected: stage === 'live', cloudExcludesSeedMediaAndServiceKey: stage !== 'local', authenticatedLiveEditingTested: false, pageErrors: errors };
  writeFileSync(join(artifacts, 'result.json'), JSON.stringify(result, null, 2) + '\n'); console.log(JSON.stringify(result));
} finally { await browser.close(); server?.close(); }
