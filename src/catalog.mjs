export const markerLabels = Object.freeze({
  flower: "Flor",
  fruit: "Fruto",
  leaf: "Folha",
  bark: "Casca",
  wholePlant: "Planta inteira",
  seed: "Semente",
  root: "Raiz",
  unknown: "Sem marcador",
});
export const normalize = (value) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
export const matchesPlant = (plant, query) =>
  normalize(query)
    .split(/\s+/)
    .every((term) =>
      normalize(
        [
          plant.commonName,
          plant.scientificName,
          plant.family,
          ...plant.alternateNames,
        ].join(" "),
      ).includes(term),
    );
export function representedSpeciesCount(catalog) {
  return new Set(
    catalog.plants.flatMap((p) =>
      p.rank === "genus"
        ? p.regionalSpecies.map((s) => s.scientificName)
        : [p.scientificName],
    ),
  ).size;
}
function requireValue(ok, message) {
  if (!ok) throw new Error(message);
}
function text(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function stringArray(value) {
  return Array.isArray(value) && value.every(text);
}
function https(value, hosts) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" && (!hosts || hosts.includes(url.hostname))
    );
  } catch {
    return false;
  }
}
export function parseCatalog(value) {
  requireValue(
    value && typeof value === "object" && value.schemaVersion === 1,
    "Versão de catálogo inválida.",
  );
  requireValue(
    value.maxSpecies === 1500 && Array.isArray(value.plants),
    "O limite é 1.500 espécies.",
  );
  requireValue(
    text(value.title) && text(value.scope) && text(value.updatedAt),
    "Metadados do catálogo incompletos.",
  );
  requireValue(
    value.plants.length > 0 && value.plants.length <= 1500,
    "Quantidade de fichas inválida.",
  );
  // Preserve old browser drafts and JSON exports without changing the input.
  value = {
    ...value,
    plants: value.plants.map((p) => {
      if (!Array.isArray(p?.photos)) return p;
      return {
        ...p,
        photos: p.photos.map((photo) =>
          !Array.isArray(photo?.markers) || !photo.markers.includes("habit")
            ? photo
            : {
                ...photo,
                markers: [
                  ...new Set(
                    photo.markers.map((marker) =>
                      marker === "habit" ? "wholePlant" : marker,
                    ),
                  ),
                ],
              },
        ),
      };
    }),
  };
  const ids = new Set(),
    represented = new Set(),
    photoIds = new Set();
  for (const p of value.plants) {
    const label = p?.scientificName || "Ficha";
    requireValue(
      p && text(p.id) && /^[a-z][a-z0-9-]*$/.test(p.id) && !ids.has(p.id),
      `${label}: ID inválido ou repetido.`,
    );
    ids.add(p.id);
    for (const field of [
      "scientificName",
      "commonName",
      "family",
      "genus",
      "description",
    ])
      requireValue(text(p[field]), `${label}: campo ${field} obrigatório.`);
    for (const field of [
      "authorship",
      "identification",
      "ecology",
      "curationNotes",
    ])
      requireValue(
        typeof p[field] === "string",
        `${label}: campo ${field} inválido.`,
      );
    for (const field of [
      "alternateNames",
      "lifeForms",
      "substrates",
      "habitats",
    ])
      requireValue(stringArray(p[field]), `${label}: campo ${field} inválido.`);
    requireValue(
      ["species", "genus"].includes(p.rank) &&
        ["native", "introduced", "invasive"].includes(p.origin),
      `${label}: classificação inválida.`,
    );
    requireValue(
      p.scientificName.startsWith(p.genus + " "),
      `${label}: gênero e nome científico incompatíveis.`,
    );
    requireValue(
      ["rio-city", "rio-state"].includes(p.geography) &&
        ["draft", "reviewed"].includes(p.reviewStatus),
      `${label}: revisão ou abrangência inválida.`,
    );
    requireValue(
      p.floraId === null || (Number.isSafeInteger(p.floraId) && p.floraId > 0),
      `${label}: ID Flora inválido.`,
    );
    requireValue(
      Array.isArray(p.sources) &&
        p.sources.length > 0 &&
        p.sources.every(
          (s) => text(s.title) && https(s.url) && text(s.retrievedAt),
        ),
      `${label}: fontes obrigatórias.`,
    );
    requireValue(
      Array.isArray(p.regionalSpecies),
      `${label}: membros regionais inválidos.`,
    );
    requireValue(
      p.rank === "species"
        ? p.regionalSpecies.length === 0
        : p.regionalSpecies.length > 0,
      `${label}: membros do grupo incoerentes.`,
    );
    const names =
      p.rank === "species"
        ? [p.scientificName]
        : p.regionalSpecies.map((s) => {
            requireValue(
              text(s.scientificName) &&
                s.scientificName.startsWith(p.genus + " ") &&
                Number.isSafeInteger(s.floraId) &&
                s.floraId > 0 &&
                stringArray(s.lifeForms) &&
                stringArray(s.substrates),
              `${label}: membro regional inválido.`,
            );
            return s.scientificName;
          });
    for (const name of names) {
      requireValue(
        !represented.has(name),
        `${name}: espécie duplicada entre fichas ou grupos.`,
      );
      represented.add(name);
    }
    requireValue(Array.isArray(p.photos), `${label}: fotos inválidas.`);
    for (const photo of p.photos) {
      requireValue(
        photo && text(photo.id) && !photoIds.has(photo.id),
        `${label}: foto repetida ou inválida.`,
      );
      photoIds.add(photo.id);
      requireValue(
        photo.license === "CC0-1.0" && photo.licenseCode === "cc0",
        `${label}: somente fotos CC0 são aceitas.`,
      );
      requireValue(
        /^inat-[0-9]+\.(jpg|jpeg|png|webp)$/.test(photo.fileName) &&
          /^[a-f0-9]{64}$/.test(photo.sha256),
        `${label}: arquivo ou hash inválido.`,
      );
      requireValue(
        [photo.photoId, photo.observationId, photo.taxonId].every(
          (n) => Number.isSafeInteger(n) && n > 0,
        ),
        `${label}: identificação iNaturalist incompleta.`,
      );
      requireValue(
        https(photo.sourceUrl, [
          "inaturalist-open-data.s3.amazonaws.com",
          "static.inaturalist.org",
        ]) &&
          https(photo.observationUrl, [
            "www.inaturalist.org",
            "inaturalist.org",
          ]),
        `${label}: origem da foto inválida.`,
      );
      requireValue(
        photo.sourceUrl.includes(`/photos/${photo.photoId}/`) &&
          photo.observationUrl ===
            `https://www.inaturalist.org/observations/${photo.observationId}`,
        `${label}: referências da foto incoerentes.`,
      );
      requireValue(
        photo.fileName.startsWith(`inat-${photo.photoId}.`),
        `${label}: nome da foto incoerente.`,
      );
      requireValue(
        photo.id === `inat-${photo.photoId}`,
        `${label}: ID da foto incoerente.`,
      );
      requireValue(
        text(photo.taxonName) &&
          text(photo.creator) &&
          text(photo.downloadedAt) &&
          typeof photo.caption === "string",
        `${label}: proveniência incompleta.`,
      );
      requireValue(
        ["draft", "reviewed"].includes(photo.reviewStatus) &&
          Array.isArray(photo.markers) &&
          photo.markers.length > 0 &&
          photo.markers.every((m) => Object.hasOwn(markerLabels, m)),
        `${label}: marcadores inválidos.`,
      );
      requireValue(
        !photo.markers.includes("unknown") || photo.markers.length === 1,
        `${label}: marcador desconhecido misturado com estruturas.`,
      );
    }
  }
  requireValue(
    represented.size <= 1500,
    "Os grupos também contam para o limite de 1.500 espécies.",
  );
  return value;
}

export const originLabels = Object.freeze({
  native: "Nativa",
  introduced: "Exótica",
  invasive: "Exótica invasora",
});
export const markerPaths = Object.freeze({
  flower:
    "M12 9C8 2 4 7 8 11C1 12 5 18 10 15C10 23 17 21 15 15C23 17 24 10 16 10C21 4 14 1 12 9ZM14 12a2 2 0 1 1-4 0a2 2 0 1 1 4 0Z",
  fruit:
    "M12 7C7 3 2 7 4 14C5 21 10 23 12 20C15 23 20 20 21 13C22 7 17 4 12 7ZM12 7V3M12 4C15 1 19 2 18 4C16 6 14 5 12 4Z",
  leaf: "M5 20C3 9 8 4 20 3C21 15 16 21 5 20ZM5 20L16 8",
  bark: "M5 3H19V21H5ZM9 3C6 9 12 13 8 21M15 3C11 10 19 13 14 21",
  wholePlant:
    "M12 22V12M5 21H19M12 14C3 15 2 8 4 5C10 5 13 8 12 14ZM12 11C12 5 16 2 21 3C22 9 18 12 12 11Z",
  seed: "M6 18C1 9 7 2 15 4C23 6 23 14 17 19C13 23 9 22 6 18ZM8 18C8 12 11 8 17 7",
  root: "M12 2V11M12 6L7 3M12 8L17 4M12 11L6 17L4 22M12 11L13 18L11 23M12 12L19 17L21 22M7 16L3 16M18 17L21 15",
});

// Differences in identification are editorial warnings, including synonyms.
export function photoMatchesPlant(plant, taxonName) {
  return plant.rank === "species"
    ? taxonName === plant.scientificName
    : plant.regionalSpecies.some(
        (member) => member.scientificName === taxonName,
      );
}
