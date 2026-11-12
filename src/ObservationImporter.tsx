import React, { useState } from "react";
import { Download, ExternalLink, Search, X } from "lucide-react";
import { photoMatchesPlant } from "./catalog.mjs";
import type { Plant, PlantPhoto } from "./catalog.mjs";
import {cloudMode,cloudRequest} from './cloud';

type Observation = {
  id: number;
  url: string;
  taxonName: string;
  taxonId: number;
  observer: string;
  qualityGrade: string;
  excludedPhotos: number;
  photos: { id: number; url: string; previewUrl: string; licenseCode: "cc0" | "cc-by" }[];
};
async function api<T>(path: string, body?: unknown): Promise<T> {
  if(cloudMode)return cloudRequest<T>('/api/inaturalist'+path,body);
  const response = await fetch(
    "/api/inaturalist" + path,
    body === undefined
      ? undefined
      : {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Plantas-Editor": "local",
          },
          body: JSON.stringify(body),
        },
  );
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      "Inicie o editor com npm run dev para importar observações.",
    );
  }
  if (!response.ok)
    throw new Error(data.error || "Não foi possível consultar o iNaturalist.");
  return data;
}
function inputId(value: string) {
  const text = value.trim();
  if (/^[1-9]\d*$/.test(text)) return text;
  try {
    const url = new URL(text);
    if (
      url.protocol === "https:" &&
      ["www.inaturalist.org", "inaturalist.org"].includes(url.hostname)
    ) {
      const match = url.pathname.match(/^\/observations\/([1-9]\d*)\/?$/);
      if (match) return match[1];
    }
  } catch {
    /* Show a local validation message below. */
  }
  throw new Error("Cole um link de observação do iNaturalist ou seu número.");
}
export function ObservationImporter({
  plant,
  replaceId,
  initialObservation,
  onImported,
  onCancel,
  onBusy,
}: {
  plant: Plant;
  replaceId: string | null;
  initialObservation?: number;
  onImported: (photos: PlantPhoto[], replaceId: string | null) => void;
  onCancel: () => void;
  onBusy: (busy: boolean) => void;
}) {
  const [input, setInput] = useState(
    initialObservation ? String(initialObservation) : "",
  );
  const [observation, setObservation] = useState<Observation | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const matches =
    observation && photoMatchesPlant(plant, observation.taxonName);
  const alreadyAdded = new Set(plant.photos.map((photo) => photo.photoId));
  async function load(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    onBusy(true);
    setObservation(null);
    setSelected([]);
    try {
      setObservation(await api<Observation>("/observations/" + inputId(input)));
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  async function download() {
    if (!observation || !selected.length) return;
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      const result = await api<{ photos: PlantPhoto[] }>("/photos", {
        observationId: observation.id,
        photoIds: selected,
        plant: {
          rank: plant.rank,
          scientificName: plant.scientificName,
          regionalSpecies: plant.regionalSpecies.map((s) => ({
            scientificName: s.scientificName,
          })),
        },
      });
      onImported(result.photos, replaceId);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <div className="observationImporter">
      <div className="importerHeading">
        <h3>
          {replaceId
            ? "Substituir foto por uma observação"
            : "Adicionar fotos de uma observação"}
        </h3>
        <button
          type="button"
          aria-label="Fechar importação"
          onClick={onCancel}
          disabled={busy}
        >
          <X size={17} />
        </button>
      </div>
      <p className="subtle">
        Cole uma observação, escolha as fotos CC0 ou CC BY e importe. Você pode adicionar
        quantas fotos e observações precisar.
      </p>
      <form className="observationSearch" onSubmit={load}>
        <label>
          Observação iNaturalist
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="https://www.inaturalist.org/observations/123456"
            disabled={busy}
          />
        </label>
        <button disabled={busy || !input.trim()}>
          <Search size={17} />
          {busy ? "Consultando…" : "Carregar observação"}
        </button>
      </form>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {observation && (
        <>
          <div className="observationSummary">
            <strong>{observation.taxonName}</strong>
            <span>por {observation.observer}</span>
            <a href={observation.url} target="_blank" rel="noreferrer">
              Observação #{observation.id} <ExternalLink size={12} />
            </a>
          </div>
          {!matches && (
            <div className="warning" role="status">
              O nome no iNaturalist ({observation.taxonName}) difere do nome da
              ficha ({plant.scientificName}). Isso pode ocorrer por sinonímia ou
              diferenças taxonômicas. Você pode importar as fotos normalmente.
            </div>
          )}
          {observation.excludedPhotos > 0 && (
            <p className="subtle">
              {observation.excludedPhotos} foto(s) sem licença CC0/CC BY ou
              indisponível(is) foram excluídas.
            </p>
          )}
          {!observation.photos.length && (
            <p role="status">Esta observação não tem fotos CC0/CC BY disponíveis.</p>
          )}
          <div className="observationCandidates">
            {observation.photos.map((photo) => (
              <label
                className={`observationCandidate ${selected.includes(photo.id) ? "selected" : ""}`}
                key={photo.id}
              >
                <img
                  src={photo.previewUrl}
                  alt={`Foto iNaturalist ${photo.id}`}
                  loading="lazy"
                />
                <span>
                  <input
                    type="checkbox"
                    aria-label={`Selecionar foto ${photo.id}`}
                    disabled={busy || alreadyAdded.has(photo.id)}
                    checked={selected.includes(photo.id)}
                    onChange={() =>
                      setSelected((ids) =>
                        ids.includes(photo.id)
                          ? ids.filter((id) => id !== photo.id)
                          : [...ids, photo.id],
                      )
                    }
                  />
                  {alreadyAdded.has(photo.id)
                    ? "Já adicionada"
                    : (photo.licenseCode === "cc-by" ? "CC BY 4.0" : "CC0") + " · Foto " + photo.id}
                </span>
              </label>
            ))}
          </div>
          <button
            type="button"
            className="primary"
            disabled={busy || !selected.length}
            onClick={download}
          >
            <Download size={17} />
            {busy
              ? "Importando…"
              : replaceId
                ? `Substituir e importar ${selected.length} foto(s)`
                : `Adicionar ${selected.length} foto(s)`}
          </button>
          <p className="subtle">
            As fotos são verificadas novamente e guardadas localmente com a
            licença e a origem. Salve a ficha e exporte o JSON para aplicar a
            seleção ao app.
          </p>
        </>
      )}
    </div>
  );
}
