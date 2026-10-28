import assert from "node:assert/strict";
import { chromium } from "playwright-core";
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox"],
});
try {
  const page = await browser.newPage();
  await page.goto(process.env.EDITOR_URL || "http://127.0.0.1:5174/");
  const habitats = page.getByRole("group", { name: "Fitofisionomias / vegetação e ambientes", exact: true });
  await habitats.waitFor();
  const candidate = habitats.locator('input[type="checkbox"]:not(:checked)').first();
  const candidateName = (await candidate.locator('..').innerText()).trim();
  await candidate.check();
  const input = habitats.getByRole("textbox");
  await input.fill("Ambiente de teste editorial");
  await habitats.getByRole("button", { name: "Adicionar", exact: true }).click();
  assert.equal(await habitats.getByLabel("Ambiente de teste editorial", { exact: true }).isChecked(), true);
  await input.fill("  ambiente de teste editorial  ");
  assert.equal(await habitats.getByRole("button", { name: "Selecionar", exact: true }).isDisabled(), true);
  await input.fill("");
  await page.getByRole("button", { name: /Salvar ficha/ }).click();
  await page.getByRole("status").filter({ hasText: "salvo neste navegador" }).waitFor();
  await page.reload();
  await habitats.waitFor();
  assert.equal(await habitats.getByLabel(candidateName, { exact: true }).isChecked(), true);
  assert.equal(await habitats.getByLabel("Ambiente de teste editorial", { exact: true }).isChecked(), true);
  await habitats.getByLabel("Ambiente de teste editorial", { exact: true }).uncheck();
  assert.equal(await habitats.getByLabel("Ambiente de teste editorial", { exact: true }).isChecked(), false);
  const license = page.getByLabel("Licença das fotos na busca");
  const search = page.getByRole("link", { name: "Pesquisar fotos no iNaturalist" });
  for (const value of ["cc0,cc-by", "cc0", "cc-by"]) {
    await license.selectOption(value);
    assert.equal(new URL(await search.getAttribute("href")).searchParams.get("photo_license"), value);
  }
  console.log("PASS: vocabulary selection, custom terms, duplicate prevention, save/reload, removal and photo license search filters.");
} finally {
  await browser.close();
}
