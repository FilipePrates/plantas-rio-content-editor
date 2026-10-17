import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const API = "https://api.inaturalist.org/v1/observations/";
const hosts = new Set([
  "inaturalist-open-data.s3.amazonaws.com",
  "static.inaturalist.org",
]);
export function observationIdFromInput(value) {
  const text = String(value).trim();
  if (/^[1-9]\d*$/.test(text) && Number.isSafeInteger(Number(text)))
    return Number(text);
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error(
      "Informe o número ou o link de uma observação do iNaturalist.",
    );
  }
  const match = url.pathname.match(/^\/observations\/([1-9]\d*)\/?$/);
  if (
    url.protocol !== "https:" ||
    !["www.inaturalist.org", "inaturalist.org"].includes(url.hostname) ||
    !match ||
    !Number.isSafeInteger(Number(match[1]))
  )
    throw new Error("Link de observação iNaturalist inválido.");
  return Number(match[1]);
}
export function photoUrl(photo, size = "large") {
  const url = new URL(photo.url);
  if (
    url.protocol !== "https:" ||
    !hosts.has(url.hostname) ||
    url.port !== "" ||
    url.username !== "" ||
    url.password !== "" ||
    !new RegExp(
      `^/photos/${photo.id}/(?:square|small|medium|large|original)\\.(?:jpg|jpeg|png|webp)$`,
    ).test(url.pathname)
  )
    throw new Error("Endereço da foto não pertence ao iNaturalist.");
  url.pathname = url.pathname.replace(
    /\/(square|small|medium|large|original)\./,
    `/${size}.`,
  );
  url.search = "";
  url.hash = "";
  return url.href;
}
function assertPhoto(photo) {
  if (
    !photo ||
    photo.license_code !== "cc0" ||
    photo.hidden ||
    photo.flags?.length ||
    photo.moderator_actions?.length ||
    !Number.isSafeInteger(photo.id) ||
    photo.id < 1
  )
    throw new Error("Esta foto não está disponível sob licença CC0.");
  return photoUrl(photo);
}
async function boundedFetch(url, limit, fetcher) {
  const response = await fetcher(url, {
    redirect: "error",
    signal: AbortSignal.timeout(45000),
    headers: {
      "User-Agent": "PlantasDoRioEditor/0.2 (CC0-only local curation)",
    },
  });
  if (!response.ok)
    throw new Error(
      `iNaturalist respondeu ${response.status}. Tente novamente em alguns instantes.`,
    );
  if (Number(response.headers.get("content-length")) > limit)
    throw new Error("Resposta maior que o limite permitido.");
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit)
        throw new Error("Resposta maior que o limite permitido.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks);
}
export function createInaturalistService({
  appRoot,
  editorRoot,
  fetcher = fetch,
} = {}) {
  let lastRequest = 0;
  const active = new Map();
  async function publicObservation(input) {
    const id = observationIdFromInput(input);
    const delay = Math.max(0, lastRequest + 1100 - Date.now());
    lastRequest = Date.now() + delay;
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    const bytes = await boundedFetch(API + id, 4_000_000, fetcher);
    const observation = JSON.parse(bytes.toString()).results?.[0];
    if (
      !observation ||
      observation.id !== id ||
      !observation.taxon ||
      observation.flags?.length
    )
      throw new Error("Observação indisponível ou sem identificação.");
    return observation;
  }
  async function inspect(input) {
    const observation = await publicObservation(input);
    return {
      id: observation.id,
      url: `https://www.inaturalist.org/observations/${observation.id}`,
      taxonName: observation.taxon.name,
      taxonId: observation.taxon.id,
      observer:
        observation.user?.name ||
        observation.user?.login ||
        "Colaborador iNaturalist",
      qualityGrade: observation.quality_grade,
      photos: (observation.photos || []).flatMap((photo) => {
        try {
          const url = assertPhoto(photo);
          return [
            {
              id: photo.id,
              url,
              previewUrl: photoUrl(photo, "medium"),
              licenseCode: "cc0",
            },
          ];
        } catch {
          return [];
        }
      }),
      excludedPhotos: (observation.photos || []).filter((photo) => {
        try {
          assertPhoto(photo);
          return false;
        } catch {
          return true;
        }
      }).length,
    };
  }
  async function cachePhoto(observation, photo) {
    const url = assertPhoto(photo);
    const sourcePath = resolve(appRoot, "assets/plants");
    const evidencePath = resolve(appRoot, "sources/inaturalist/photos");
    const evidenceFile = resolve(evidencePath, `${photo.id}.json`);
    const fileName = `inat-${photo.id}.${new URL(url).pathname.split(".").pop()}`;
    const creator =
      photo.attribution_name ||
      observation.user?.name ||
      observation.user?.login ||
      "Colaborador iNaturalist";
    await Promise.all([
      mkdir(sourcePath, { recursive: true }),
      mkdir(evidencePath, { recursive: true }),
      mkdir(resolve(editorRoot, "public/photos"), { recursive: true }),
    ]);
    let evidence, payload;
    // Keep the original acquisition evidence immutable if this image is already cached.
    if (existsSync(evidenceFile)) {
      evidence = JSON.parse(await readFile(evidenceFile, "utf8"));
      payload = await readFile(resolve(sourcePath, fileName));
      if (
        evidence.photo.license_code !== "cc0" ||
        evidence.photo.id !== photo.id ||
        evidence.observation.id !== observation.id ||
        evidence.observation.taxon.name !== observation.taxon.name ||
        evidence.download.url !== url ||
        createHash("sha256").update(payload).digest("hex") !==
          evidence.download.sha256
      )
        throw new Error(
          "O cache desta foto diverge da observação. Revise-o antes de importar.",
        );
    } else {
      payload = await boundedFetch(url, 15_000_000, fetcher);
      if (!(
        payload.subarray(0, 3).equals(Buffer.from([255, 216, 255])) ||
        payload
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
        (payload.subarray(0, 4).toString() === "RIFF" &&
          payload.subarray(8, 12).toString() === "WEBP")
      ))
        throw new Error("O arquivo recebido não é uma imagem suportada.");
      evidence = {
        apiUrl: API + observation.id,
        photo,
        creator,
        observation: {
          id: observation.id,
          quality_grade: observation.quality_grade,
          taxon: { id: observation.taxon.id, name: observation.taxon.name },
          observerLogin: observation.user?.login,
        },
        download: {
          url,
          sha256: createHash("sha256").update(payload).digest("hex"),
          retrievedAt: new Date().toISOString(),
        },
      };
      await writeFile(resolve(sourcePath, fileName) + ".tmp", payload);
      await rename(
        resolve(sourcePath, fileName) + ".tmp",
        resolve(sourcePath, fileName),
      );
      await writeFile(
        evidenceFile + ".tmp",
        JSON.stringify(evidence, null, 2) + "\n",
      );
      await rename(evidenceFile + ".tmp", evidenceFile);
    }
    await writeFile(resolve(editorRoot, "public/photos", fileName), payload);
    return {
      id: `inat-${photo.id}`,
      fileName,
      photoId: photo.id,
      observationId: observation.id,
      taxonId: observation.taxon.id,
      taxonName: observation.taxon.name,
      creator: evidence.creator,
      license: "CC0-1.0",
      licenseCode: "cc0",
      sourceUrl: evidence.download.url,
      observationUrl: `https://www.inaturalist.org/observations/${observation.id}`,
      downloadedAt: evidence.download.retrievedAt,
      sha256: evidence.download.sha256,
      markers: ["unknown"],
      caption: "",
      reviewStatus: "draft",
    };
  }
  async function importPhotos({ observationId, photoIds, plant }) {
    if (
      !plant ||
      !["species", "genus"].includes(plant.rank) ||
      typeof plant.scientificName !== "string"
    )
      throw new Error("Ficha de planta inválida.");
    if (
      !Array.isArray(photoIds) ||
      !photoIds.length ||
      photoIds.length > 100 ||
      !photoIds.every((id) => Number.isSafeInteger(id) && id > 0) ||
      new Set(photoIds).size !== photoIds.length
    )
      throw new Error("Selecione as fotos a importar.");
    const observation = await publicObservation(observationId);
    const selected = photoIds.map((id) => {
      const photo = observation.photos?.find((photo) => photo.id === id);
      assertPhoto(photo);
      return photo;
    });
    const photos = [];
    for (const photo of selected) {
      if (!active.has(photo.id))
        active.set(
          photo.id,
          cachePhoto(observation, photo).finally(() => active.delete(photo.id)),
        );
      const imported = await active.get(photo.id);
      if (
        imported.observationId !== observation.id ||
        imported.taxonName !== observation.taxon.name
      )
        throw new Error(
          "Esta foto já foi vinculada a outra observação. Revise a origem antes de importar.",
        );
      photos.push(imported);
    }
    return photos;
  }
  return { inspect, importPhotos };
}

export function inaturalistPlugin() {
  const editorRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const appRoot = resolve(editorRoot, "../plantas-do-rio-de-janeiro");
  const service = createInaturalistService({ appRoot, editorRoot });
  return {
    name: "plantas-local-inaturalist",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/api/inaturalist", async (req, res, next) => {
        if (!["GET", "POST"].includes(req.method)) {
          res.statusCode = 405;
          res.end();
          return;
        }
        const host = req.headers.host || "";
        const origin = req.headers.origin;
        if (
          !/^(127\.0\.0\.1|localhost):\d+$/.test(host) ||
          (origin && ![`http://${host}`].includes(origin)) ||
          (req.method === "POST" &&
            (req.headers["x-plantas-editor"] !== "local" ||
              origin !== `http://${host}`))
        ) {
          res.statusCode = 403;
          res.end("Origem local inválida.");
          return;
        }
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        try {
          const match = (req.url || "").match(/^\/observations\/([1-9]\d*)$/);
          if (req.method === "GET" && match) {
            res.end(JSON.stringify(await service.inspect(match[1])));
            return;
          }
          if (req.method === "POST" && req.url === "/photos") {
            const chunks = [];
            let length = 0;
            for await (const chunk of req) {
              length += chunk.length;
              if (length > 500_000)
                throw new Error("Pedido maior que o limite permitido.");
              chunks.push(chunk);
            }
            const body = JSON.parse(Buffer.concat(chunks).toString());
            res.end(
              JSON.stringify({ photos: await service.importPhotos(body) }),
            );
            return;
          }
          res.statusCode = 404;
          res.end(JSON.stringify({ error: "Rota inexistente." }));
        } catch (error) {
          res.statusCode = 400;
          res.end(
            JSON.stringify({
              error: error.message || "Não foi possível importar as fotos.",
            }),
          );
        }
      });
    },
  };
}
