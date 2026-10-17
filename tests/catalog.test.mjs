import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseCatalog, representedSpeciesCount } from "../src/catalog.mjs";
const read = () =>
  JSON.parse(
    readFileSync(new URL("../public/catalog.json", import.meta.url), "utf8"),
  );
test("editor seed round-trips through the shared app contract", () => {
  const catalog = parseCatalog(read());
  assert.deepEqual(parseCatalog(JSON.parse(JSON.stringify(catalog))), catalog);
  assert.ok(representedSpeciesCount(catalog) <= 1500);
});
test("imports reject unsupported photos and repeated entries", () => {
  const catalog = read();
  const photo = catalog.plants.flatMap((p) => p.photos)[0];
  assert.ok(photo, "Seed should include at least one verified CC0 photo.");
  photo.licenseCode = "cc-by";
  assert.throws(() => parseCatalog(catalog), /CC0/);
  const duplicate = read();
  duplicate.plants.push(structuredClone(duplicate.plants[0]));
  assert.throws(() => parseCatalog(duplicate), /ID/);
});
