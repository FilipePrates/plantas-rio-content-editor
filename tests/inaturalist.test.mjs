import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createInaturalistService,
  observationIdFromInput,
  photoUrl,
} from "../server/inaturalist.mjs";

function observation() {
  return {
    id: 456,
    license_code: "cc-by-nc",
    quality_grade: "research",
    flags: [],
    user: { login: "observer" },
    taxon: { id: 789, name: "Euterpe edulis" },
    photos: [
      {
        id: 123,
        license_code: "cc0",
        url: "https://inaturalist-open-data.s3.amazonaws.com/photos/123/square.jpg",
        flags: [],
      },
      {
        id: 124,
        license_code: "cc-by",
        url: "https://static.inaturalist.org/photos/124/square.jpg",
        flags: [],
      },
      {
        id: 125,
        license_code: "cc0",
        hidden: true,
        url: "https://static.inaturalist.org/photos/125/square.jpg",
      },
    ],
  };
}
async function setup(t, value = observation()) {
  const root = await mkdtemp(join(tmpdir(), "plantas-inat-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const requests = [];
  const fetcher = async (url, options) => {
    requests.push({ url, options });
    return String(url).includes("/v1/observations/")
      ? new Response(JSON.stringify({ results: [value] }))
      : new Response(Buffer.from([255, 216, 255, 0, 1, 2, 3]));
  };
  return {
    root,
    requests,
    service: createInaturalistService({
      appRoot: join(root, "app"),
      editorRoot: join(root, "editor"),
      fetcher,
    }),
  };
}
const plant = {
  rank: "species",
  scientificName: "Euterpe edulis",
  regionalSpecies: [],
};
test("observation input accepts only integer IDs and official observation URLs", () => {
  assert.equal(observationIdFromInput("456"), 456);
  assert.equal(
    observationIdFromInput("https://www.inaturalist.org/observations/456?x=1"),
    456,
  );
  for (const input of [
    "https://evil.test/observations/456",
    "https://www.inaturalist.org/taxa/456",
    "../../456",
    "0",
    "https://www.inaturalist.org.evil.test/observations/456",
  ])
    assert.throws(() => observationIdFromInput(input));
  assert.throws(() =>
    photoUrl({ id: 123, url: "https://evil.test/photos/123/square.jpg" }),
  );
});
test("preview checks the photo license, excluding licensed differently or hidden photos", async (t) => {
  const { service } = await setup(t);
  const result = await service.inspect(456);
  assert.deepEqual(
    result.photos.map((photo) => photo.id),
    [123],
  );
  assert.equal(result.excludedPhotos, 2);
});
test("selected CC0 photos are cached with rights evidence while canonical catalog remains untouched", async (t) => {
  const { root, service, requests } = await setup(t);
  const [photo] = await service.importPhotos({
    plant,
    observationId: 456,
    photoIds: [123],
  });
  assert.equal(photo.licenseCode, "cc0");
  assert.deepEqual(photo.markers, ["unknown"]);
  const evidencePath = join(root, "app/sources/inaturalist/photos/123.json");
  const evidenceText = await readFile(evidencePath, "utf8");
  const evidence = JSON.parse(evidenceText);
  assert.equal(evidence.download.sha256, photo.sha256);
  assert.equal(evidence.observation.id, 456);
  assert.deepEqual(
    await readFile(join(root, "editor/public/photos/inat-123.jpg")),
    await readFile(join(root, "app/assets/plants/inat-123.jpg")),
  );
  assert.equal(requests[1].options.redirect, "error");
  const [again] = await service.importPhotos({
    plant,
    observationId: 456,
    photoIds: [123],
  });
  assert.equal(again.downloadedAt, photo.downloadedAt);
  assert.equal(await readFile(evidencePath, "utf8"), evidenceText);
});
test("CC BY without attribution fails before any file download", async (t) => {
  const { service, requests } = await setup(t);
  await assert.rejects(
    service.importPhotos({ plant, observationId: 456, photoIds: [123, 124] }),
    /CC0/,
  );
  assert.ok(
    requests.every((request) => request.url.includes("/v1/observations/")),
  );
});
test("species and genus mismatches import while preserving the observation identification", async (t) => {
  const { service } = await setup(t);
  for (const target of [
    { ...plant, scientificName: "Different identification" },
    {
      rank: "genus",
      scientificName: "Euterpe spp.",
      regionalSpecies: [{ scientificName: "Euterpe oleracea" }],
    },
  ]) {
    const [photo] = await service.importPhotos({
      plant: target,
      observationId: 456,
      photoIds: [123],
    });
    assert.equal(photo.taxonName, "Euterpe edulis");
    assert.equal(photo.taxonId, 789);
    assert.equal(photo.licenseCode, "cc0");
    assert.equal(photo.reviewStatus, "draft");
  }
});

// Photo copyright belongs to the named photographer, not necessarily the observer.
test("CC BY imports preserve full attribution and immutable evidence", async (t) => {
  const value = observation();
  value.photos[1].attribution = "(c) Another Photographer, some rights reserved (CC BY)";
  const { root, service } = await setup(t, value);
  const preview = await service.inspect(456);
  assert.deepEqual(preview.photos.map(p => p.id), [123, 124]);
  const [photo] = await service.importPhotos({ plant, observationId: 456, photoIds: [124] });
  assert.equal(photo.license, "CC-BY-4.0");
  assert.equal(photo.licenseCode, "cc-by");
  assert.equal(photo.creator, "Another Photographer");
  assert.equal(photo.attribution, value.photos[1].attribution);
  assert.equal(photo.licenseUrl, "https://creativecommons.org/licenses/by/4.0/");
  assert.equal(photo.photoPageUrl, "https://www.inaturalist.org/photos/124");
  assert.equal(photo.reviewStatus, "draft");
  assert.deepEqual(photo.markers, ["unknown"]);
  const path = join(root, "app/sources/inaturalist/photos/124.json");
  const evidence = await readFile(path, "utf8");
  value.photos[1].attribution = "(c) Changed account name, some rights reserved (CC BY)";
  const [again] = await service.importPhotos({ plant, observationId: 456, photoIds: [124] });
  assert.deepEqual(again, photo);
  assert.equal(await readFile(path, "utf8"), evidence);
});
test("NC, SA and ND licenses cannot be downloaded", async (t) => {
  for (const code of ["cc-by-nc", "cc-by-sa", "cc-by-nd", "cc-by-nc-sa"]) {
    const value = observation();
    value.photos[1].license_code = code;
    value.photos[1].attribution = "Photographer";
    const { service, requests } = await setup(t, value);
    await assert.rejects(service.importPhotos({ plant, observationId: 456, photoIds: [124] }), /CC0/);
    assert.equal(requests.length, 1);
  }
});
