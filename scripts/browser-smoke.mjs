import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
const artifacts = join(tmpdir(), "plantas-rio-browser-tests");
mkdirSync(artifacts, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox"],
});
try {
  const editor = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  const page = await editor.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(process.env.EDITOR_URL || "http://127.0.0.1:5174/");
  await page.getByLabel("Nome comum principal (opcional)", { exact: true }).waitFor();
  const oldName = await page
    .getByLabel("Nome comum principal (opcional)", { exact: true })
    .inputValue();
  const newName = oldName + " — revisão de teste";
  await page.getByLabel("Nome comum principal (opcional)", { exact: true }).fill(newName);
  await page.getByRole("button", { name: /Salvar ficha/ }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "salvo neste navegador" })
    .waitFor();
  await page.reload();
  await page.getByLabel("Nome comum principal (opcional)", { exact: true }).waitFor();
  assert.equal(
    await page.getByLabel("Nome comum principal (opcional)", { exact: true }).inputValue(),
    newName,
  );
  const flower = page.getByLabel("Flor", { exact: true }).first();
  await flower.check();
  await page.getByRole("button", { name: /Salvar ficha/ }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "salvo neste navegador" })
    .waitFor();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar JSON" }).click();
  const download = await downloadPromise;
  await download.saveAs(join(artifacts, "editor-export.json"));
  const exported = JSON.parse(
    readFileSync(join(artifacts, "editor-export.json"), "utf8"),
  );
  const changed = exported.plants.find((p) => p.commonName === newName);
  assert.ok(changed);
  assert.ok(changed.photos[0].markers.includes("flower"));
  assert.equal(changed.photos[0].licenseCode, "cc0");
  await page.getByLabel("Nome comum principal (opcional)", { exact: true }).fill("Não salvo");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.locator(".plantList button").nth(1).click();
  assert.equal(
    await page.getByLabel("Nome comum principal (opcional)", { exact: true }).inputValue(),
    "Não salvo",
  );
  await page.getByRole("button", { name: "Exportar JSON" }).click();
  await page.getByRole("alert").filter({ hasText: "Salve a ficha" }).waitFor();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator(".plantList button").nth(1).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .locator("input[type=file]")
    .setInputFiles(join(artifacts, "editor-export.json"));
  await page
    .getByRole("status")
    .filter({ hasText: "JSON validado e importado" })
    .waitFor();
  const bad = structuredClone(exported);
  bad.plants.find((p) => p.photos.length).photos[0].licenseCode = "cc-by-nc";
  writeFileSync(join(artifacts, "editor-invalid.json"), JSON.stringify(bad));
  await page
    .locator("input[type=file]")
    .setInputFiles(join(artifacts, "editor-invalid.json"));
  await page
    .getByRole("alert")
    .filter({ hasText: "somente fotos CC0" })
    .waitFor();
  await page.screenshot({
    path: join(artifacts, "editor-desktop.png"),
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "EDITOR PASS: persistent saves, markers, export, unsaved changes, import and CC0 rejection.",
  );
  await editor.close();

  const guide = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    deviceScaleFactor: 1,
  });
  const app = await guide.newPage();
  const appErrors = [];
  app.on("pageerror", (error) => appErrors.push(String(error)));
  await app.goto(process.env.APP_URL || "http://127.0.0.1:8083/", {
    timeout: 120000,
  });
  await app
    .getByRole("textbox", { name: "Buscar plantas" })
    .waitFor({ timeout: 120000 });
  await app.getByRole("textbox", { name: "Buscar plantas" }).fill("jucara");
  await app
    .getByRole("button", { name: "Palmito-juçara", exact: true })
    .click();
  await app.getByText("Descrição", { exact: true }).waitFor();
  assert.equal(
    await app
      .getByRole("button", { name: "Adicionar às listas", exact: true })
      .count(),
    0,
  );
  await app.getByRole("tab", { name: "Famílias", exact: true }).click();
  await app.getByRole("textbox", { name: "Buscar famílias" }).fill("areca");
  await app
    .getByRole("button", { name: "Filtrar por Arecaceae", exact: true })
    .click();
  await app
    .getByRole("button", { name: "Remover filtro de família" })
    .waitFor();
  assert.equal(
    await app.getByRole("textbox", { name: "Buscar plantas" }).inputValue(),
    "",
  );
  assert.ok((await app.locator('[data-testid^="plant-grid-"]').count()) > 1);
  await app.reload();
  await app
    .getByRole("button", { name: "Remover filtro de família" })
    .waitFor();
  await app.getByRole("button", { name: "Remover filtro de família" }).click();
  assert.equal(
    await app
      .getByRole("button", { name: "Remover filtro de família" })
      .count(),
    0,
  );
  await app.getByRole("button", { name: "Configurações", exact: true }).click();
  for (const name of [
    "Flor",
    "Fruto",
    "Folha",
    "Casca",
    "Planta inteira",
    "Semente",
    "Raiz",
  ]) {
    await app.getByRole("img", { name, exact: true }).waitFor();
  }
  await app
    .getByRole("switch", { name: "Modo avançado: lista por família" })
    .click();
  await app.getByRole("tab", { name: "Guia", exact: true }).click();
  await app.getByRole("button", { name: "Exibir grade" }).waitFor();
  await app.screenshot({
    path: join(artifacts, "app-mobile.png"),
    fullPage: true,
  });
  await app.getByRole("textbox", { name: "Buscar plantas" }).fill("anthurium");
  await app
    .getByRole("button", { name: "Abrir Antúrios nativos", exact: true })
    .click();
  await app
    .getByRole("button", { name: /46 espécies nativas registradas no estado/ })
    .waitFor();
  await app.getByRole("tab", { name: "Guia", exact: true }).click();
  await app.getByRole("textbox", { name: "Buscar plantas" }).fill("leucena");
  await app.getByRole("button", { name: "Abrir Leucena", exact: true }).click();
  await app.getByRole("img", { name: "Fruto", exact: true }).waitFor();
  await app
    .getByRole("button", { name: /Foto 2: Inflorescência globosa/ })
    .click();
  await app.getByRole("img", { name: "Flor", exact: true }).waitFor();
  await app.screenshot({
    path: join(artifacts, "plant-profile.png"),
    fullPage: true,
  });
  assert.deepEqual(appErrors, []);
  console.log(
    "APP PASS: search, persistent family filters, removable tag, icon legend, advanced view, genus counts and flower/fruit markers.",
  );
  await guide.close();
} finally {
  await browser.close();
}
