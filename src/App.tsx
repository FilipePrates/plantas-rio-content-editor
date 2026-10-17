import React, { useEffect, useRef, useState } from "react";
import {
  Download,
  Flower2,
  Leaf,
  Plus,
  Save,
  Search,
  Upload,
  X,
} from "lucide-react";
import {
  markerLabels,
  markerPaths,
  originLabels,
  matchesPlant,
  photoMatchesPlant,
  parseCatalog,
  representedSpeciesCount,
} from "./catalog.mjs";
import type { Catalog, Plant, PlantPhoto, PhotoMarker } from "./catalog.mjs";
import { loadCatalog, storeCatalog } from "./storage";
import { ObservationImporter } from "./ObservationImporter";

const clone = <T,>(value: T): T => structuredClone(value);
export default function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [draft, setDraft] = useState<Plant | null>(null);
  const [query, setQuery] = useState("");
  const [family, setFamily] = useState("");
  const [origin, setOrigin] = useState("");
  const [status, setStatus] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [photoImport, setPhotoImport] = useState<{
    replaceId: string | null;
    observationId?: number;
    key: number;
  } | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [advancedJson, setAdvancedJson] = useState("");
  const [advancedChanged, setAdvancedChanged] = useState(false);
  const [initialDraft, setInitialDraft] = useState("");
  const importInput = useRef<HTMLInputElement>(null);
  const dirty = Boolean(
    draft && (JSON.stringify(draft) !== initialDraft || advancedChanged),
  );
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const local = await loadCatalog();
      const response = local ? null : await fetch("/catalog.json");
      if (response && !response.ok)
        throw new Error("Não foi possível carregar o catálogo inicial.");
      const value = local || parseCatalog(await response!.json());
      if (!cancelled) {
        setCatalog(value);
        select(value.plants[0]);
        setNotice(
          local
            ? "Rascunho local recuperado. Exporte JSON regularmente como cópia de segurança."
            : "Catálogo inicial carregado. As alterações ficam neste navegador.",
        );
      }
    })().catch((err) => {
      if (!cancelled) {
        setError(String(err));
        setLoadFailed(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  function select(plant: Plant) {
    const value = clone(plant);
    setDraft(value);
    setInitialDraft(JSON.stringify(value));
    setAdvancedJson(
      JSON.stringify(
        {
          sources: value.sources,
          regionalSpecies: value.regionalSpecies,
          floraId: value.floraId,
          curationNotes: value.curationNotes,
        },
        null,
        2,
      ),
    );
    setAdvancedChanged(false);
    setPhotoImport(null);
    setError("");
  }
  function canLeave() {
    if (mediaBusy) return false;
    return (
      !dirty ||
      window.confirm("Descartar as alterações ainda não salvas nesta ficha?")
    );
  }
  function edit<K extends keyof Plant>(key: K, value: Plant[K]) {
    if (draft) setDraft({ ...draft, [key]: value });
  }
  async function persist(next: Catalog, message: string) {
    const valid = parseCatalog(next);
    await storeCatalog(valid); // Publish UI state only after durable IndexedDB commit.
    setCatalog(valid);
    setNotice(message);
  }
  async function save() {
    if (!catalog || !draft) return;
    setBusy(true);
    setError("");
    try {
      const extra = advancedChanged
        ? JSON.parse(advancedJson)
        : {
            sources: draft.sources,
            regionalSpecies: draft.regionalSpecies,
            floraId: draft.floraId,
            curationNotes: draft.curationNotes,
          };
      const plant: Plant = {
        ...draft,
        sources: extra.sources,
        regionalSpecies: extra.regionalSpecies,
        floraId: extra.floraId,
        curationNotes: extra.curationNotes,
      };
      const exists = catalog.plants.some((p) => p.id === plant.id);
      const next = {
        ...catalog,
        updatedAt: new Date().toISOString(),
        plants: exists
          ? catalog.plants.map((p) => (p.id === plant.id ? plant : p))
          : [...catalog.plants, plant],
      };
      await persist(next, `${plant.commonName}: salvo neste navegador.`);
      select(plant);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }
  function add() {
    if (!canLeave()) return;
    select({
      id: `nova-planta-${Date.now()}`,
      scientificName: "",
      authorship: "",
      commonName: "",
      alternateNames: [],
      family: "",
      genus: "",
      rank: "species",
      origin: "native",
      geography: "rio-state",
      reviewStatus: "draft",
      description: "",
      identification: "",
      ecology: "",
      lifeForms: [],
      substrates: [],
      habitats: [],
      floraId: null,
      regionalSpecies: [],
      sources: [],
      photos: [],
      curationNotes: "",
    });
  }
  function exportCatalog() {
    if (!catalog) return;
    if (dirty) {
      setError("Salve a ficha ou descarte as alterações antes de exportar.");
      return;
    }
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(parseCatalog(catalog), null, 2) + "\n"], {
        type: "application/json",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `plantas-rio-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importCatalog(file: File) {
    setError("");
    try {
      const incoming = parseCatalog(JSON.parse(await file.text()));
      if (
        !canLeave() ||
        !window.confirm(
          `Substituir o rascunho local por ${incoming.plants.length} fichas (${representedSpeciesCount(incoming)} espécies)? Exporte seu trabalho atual antes de continuar.`,
        )
      )
        return;
      setBusy(true);
      await persist(
        incoming,
        "JSON validado e importado. Fotos novas precisam ser verificadas no repositório antes de entrar no app.",
      );
      select(incoming.plants[0]);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }
  if (!catalog || !draft)
    return (
      <main className="loading">
        <Leaf size={44} />
        <h1>Plantas do Rio · Editor</h1>
        <p role="alert">{error || "Carregando catálogo…"}</p>
        {loadFailed && (
          <p>
            O rascunho local foi preservado. Verifique o acesso ao armazenamento
            do navegador e recarregue a página.
          </p>
        )}
      </main>
    );
  const visible = catalog.plants.filter(
    (p) =>
      matchesPlant(p, query) &&
      (!family || p.family === family) &&
      (!origin || p.origin === origin) &&
      (!status || p.reviewStatus === status),
  );
  const families = [...new Set(catalog.plants.map((p) => p.family))].sort();
  const field = (
    key:
      | "commonName"
      | "scientificName"
      | "authorship"
      | "family"
      | "genus"
      | "description"
      | "identification"
      | "ecology",
    label: string,
    multiline = false,
  ) => (
    <label>
      {label}
      {multiline ? (
        <textarea
          disabled={busy || mediaBusy}
          rows={5}
          value={draft[key]}
          onChange={(e) => edit(key, e.target.value)}
        />
      ) : (
        <input
          disabled={busy || mediaBusy}
          value={draft[key]}
          onChange={(e) => edit(key, e.target.value)}
        />
      )}
    </label>
  );
  const listField = (
    key: "alternateNames" | "lifeForms" | "substrates" | "habitats",
    label: string,
  ) => (
    <label>
      {label}
      <input
        disabled={busy || mediaBusy}
        value={draft[key].join(";")}
        onChange={(e) => edit(key, e.target.value.split(";"))}
        onBlur={() =>
          edit(key, draft[key].map((s) => s.trim()).filter(Boolean))
        }
      />
      <small>Separe os itens com ponto e vírgula.</small>
    </label>
  );
  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <Leaf size={32} />
          <div>
            <strong>Plantas do Rio de Janeiro</strong>
            <span>Editor de conteúdo · rascunho local</span>
          </div>
        </div>
        <div className="actions">
          <button
            disabled={busy || mediaBusy}
            onClick={() => importInput.current?.click()}
          >
            <Upload size={17} />
            Importar JSON
          </button>
          <button disabled={busy || mediaBusy} onClick={exportCatalog}>
            <Download size={17} />
            Exportar JSON
          </button>
          <button
            className="primary"
            disabled={busy || mediaBusy}
            onClick={save}
          >
            <Save size={17} />
            {busy ? "Salvando…" : "Salvar ficha"}
            {dirty ? " *" : ""}
          </button>
          <input
            ref={importInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              if (e.target.files?.[0]) void importCatalog(e.target.files[0]);
              e.target.value = "";
            }}
          />
        </div>
      </header>
      <div className="workspace">
        <aside>
          <div className="sidebarIntro">
            <h2>Catálogo</h2>
            <button
              title="Adicionar planta"
              aria-label="Adicionar planta"
              disabled={busy || mediaBusy}
              onClick={add}
            >
              <Plus size={18} />
            </button>
          </div>
          <p className="subtle">
            {catalog.plants.length} fichas · {representedSpeciesCount(catalog)}{" "}
            / 1.500 espécies
          </p>
          <div className="search">
            <Search size={17} />
            <input
              aria-label="Buscar plantas"
              placeholder="Nome, espécie ou família"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <select
            disabled={busy || mediaBusy}
            aria-label="Filtrar família"
            value={family}
            onChange={(e) => setFamily(e.target.value)}
          >
            <option value="">Todas as famílias</option>
            {families.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
          <div className="filterPair">
            <select
              disabled={busy || mediaBusy}
              aria-label="Filtrar origem"
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
            >
              <option value="">Todas</option>
              <option value="native">Nativas</option>
              <option value="introduced">Exóticas</option>
              <option value="invasive">Invasoras</option>
            </select>
            <select
              disabled={busy || mediaBusy}
              aria-label="Filtrar revisão"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">Todos os status</option>
              <option value="draft">Rascunhos</option>
              <option value="reviewed">Revisadas</option>
            </select>
          </div>
          <p className="subtle">{visible.length} resultados</p>
          <nav className="plantList">
            {visible.map((p) => (
              <button
                disabled={busy || mediaBusy}
                key={p.id}
                className={draft.id === p.id ? "active" : ""}
                onClick={() => {
                  if (canLeave()) select(p);
                }}
              >
                <span className="listPreview">
                  {p.photos[0] ? (
                    <img
                      key={p.photos[0].fileName}
                      src={`/photos/${p.photos[0].fileName}`}
                      alt=""
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.style.visibility = "hidden";
                      }}
                    />
                  ) : (
                    <Leaf size={22} />
                  )}
                  {p.origin === "invasive" && (
                    <span className="invasiveIcon" title="Exótica invasora">
                      !
                    </span>
                  )}
                </span>
                <span>
                  <strong>{p.commonName}</strong>
                  <em>{p.scientificName}</em>
                  <small>
                    {p.family} ·{" "}
                    {p.rank === "genus"
                      ? `${p.regionalSpecies.length} espécies`
                      : p.reviewStatus === "reviewed"
                        ? "Revisada"
                        : "Rascunho"}
                  </small>
                </span>
              </button>
            ))}
          </nav>
        </aside>
        <main>
          <div className="notice" role="status">
            {notice}
          </div>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <div className="pageHeading">
            <div>
              <span className="eyebrow">{draft.family || "NOVA FICHA"}</span>
              <h1>{draft.commonName || "Nova planta"}</h1>
              <p>
                <i>{draft.scientificName}</i>
              </p>
            </div>
            <span
              className={`badge ${draft.origin === "invasive" ? "amber" : ""}`}
            >
              {originLabels[draft.origin]}
            </span>
          </div>
          <div className="classificationBar">
            <label className="invasiveToggle">
              <input
                type="checkbox"
                aria-label="Exótica invasora"
                checked={draft.origin === "invasive"}
                disabled={busy || mediaBusy}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    origin: e.target.checked ? "invasive" : "introduced",
                    reviewStatus: "draft",
                  })
                }
              />
              <span className="invasiveIcon">!</span> Exótica invasora
            </label>
            <span className="subtle">
              A classificação é salva na ficha e aparece no guia.
            </span>
          </div>
          <section>
            <h2>Identidade</h2>
            <div className="formGrid">
              {field("commonName", "Nome principal")}
              {field("scientificName", "Nome científico (sem autoria)")}
              {field("authorship", "Autoria botânica")}
              {field("family", "Família")}
              {field("genus", "Gênero")}
              <label>
                Nível da ficha
                <select
                  disabled={busy || mediaBusy}
                  value={draft.rank}
                  onChange={(e) =>
                    edit("rank", e.target.value as Plant["rank"])
                  }
                >
                  <option value="species">Espécie</option>
                  <option value="genus">Grupo de espécies de um gênero</option>
                </select>
              </label>
              <label>
                Origem
                <select
                  disabled={busy || mediaBusy}
                  value={draft.origin}
                  onChange={(e) =>
                    edit("origin", e.target.value as Plant["origin"])
                  }
                >
                  <option value="native">Nativa</option>
                  <option value="introduced">
                    Exótica (sem indicação de invasão)
                  </option>
                  <option value="invasive">Exótica invasora</option>
                </select>
              </label>
              <label>
                Abrangência comprovada
                <select
                  disabled={busy || mediaBusy}
                  value={draft.geography}
                  onChange={(e) =>
                    edit("geography", e.target.value as Plant["geography"])
                  }
                >
                  <option value="rio-state">Estado do Rio de Janeiro</option>
                  <option value="rio-city">Município do Rio de Janeiro</option>
                </select>
              </label>
              <label>
                Revisão editorial
                <select
                  disabled={busy || mediaBusy}
                  value={draft.reviewStatus}
                  onChange={(e) =>
                    edit(
                      "reviewStatus",
                      e.target.value as Plant["reviewStatus"],
                    )
                  }
                >
                  <option value="draft">Rascunho</option>
                  <option value="reviewed">Revisado</option>
                </select>
              </label>
              {listField("alternateNames", "Outros nomes")}
            </div>
            <p className="subtle">
              ID permanente: {draft.id}. Agrupar um gênero exige listar as
              espécies regionais nas fontes abaixo.
            </p>
          </section>
          <section>
            <h2>Texto do perfil</h2>
            {field("description", "Descrição", true)}
            {field("identification", "Como reconhecer", true)}
            {field("ecology", "Ambiente e ecologia", true)}
            <div className="formGrid">
              {listField("lifeForms", "Formas de vida")}
              {listField("substrates", "Substratos")}
              {listField("habitats", "Vegetação / ambientes")}
            </div>
          </section>
          <section>
            <h2>
              <Flower2 size={21} /> Fotos e estruturas
            </h2>
            <p className="subtle">
              Somente fotos CC0 do iNaturalist. Flor e fruto devem ser marcados
              após conferir a própria imagem. A licença e a proveniência são
              preservadas.
            </p>
            <div className="mediaToolbar">
              <button
                type="button"
                disabled={busy || mediaBusy}
                onClick={() =>
                  setPhotoImport({ replaceId: null, key: Date.now() })
                }
              >
                <Plus size={17} />
                Adicionar fotos do iNaturalist
              </button>
              <span className="subtle">
                {draft.photos.length} fotos · sem limite por planta
              </span>
            </div>
            {photoImport && (
              <ObservationImporter
                key={photoImport.key}
                plant={draft}
                replaceId={photoImport.replaceId}
                initialObservation={photoImport.observationId}
                onBusy={setMediaBusy}
                onCancel={() => setPhotoImport(null)}
                onImported={(photos, replaceId) => {
                  setDraft((current) => {
                    if (!current || current.id !== draft.id) return current;
                    const unique = photos.filter(
                      (photo) =>
                        !current.photos.some(
                          (existing) => existing.photoId === photo.photoId,
                        ),
                    );
                    const next = [...current.photos];
                    const replaceIndex = replaceId
                      ? next.findIndex((photo) => photo.id === replaceId)
                      : -1;
                    if (replaceIndex >= 0 && unique.length)
                      next.splice(replaceIndex, 1, ...unique);
                    else next.push(...unique);
                    return { ...current, photos: next };
                  });
                  setPhotoImport(null);
                  setNotice(
                    `${photos.length} foto(s) importada(s). Salve a ficha para guardar esta seleção.`,
                  );
                }}
              />
            )}
            {draft.photos.length > 0 && (
              <div className="observationInventory">
                <h3>Observações deste perfil</h3>
                {[
                  ...new Set(draft.photos.map((photo) => photo.observationId)),
                ].map((id) => (
                  <div className="observationInventoryRow" key={id}>
                    <a
                      href={`https://www.inaturalist.org/observations/${id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      #{id}
                    </a>
                    <span className="subtle">
                      {
                        draft.photos.filter(
                          (photo) => photo.observationId === id,
                        ).length
                      }{" "}
                      foto(s)
                    </span>
                    <button
                      type="button"
                      disabled={busy || mediaBusy}
                      onClick={() =>
                        setPhotoImport({
                          replaceId: null,
                          observationId: id,
                          key: Date.now(),
                        })
                      }
                    >
                      Ver outras fotos
                    </button>
                    <button
                      type="button"
                      disabled={busy || mediaBusy}
                      onClick={() => {
                        if (
                          window.confirm(
                            "Remover desta ficha todas as fotos desta observação?",
                          )
                        )
                          edit(
                            "photos",
                            draft.photos.filter(
                              (photo) => photo.observationId !== id,
                            ),
                          );
                      }}
                    >
                      Remover da ficha
                    </button>
                  </div>
                ))}
              </div>
            )}
            {!draft.photos.length && (
              <div className="empty">
                <Leaf size={40} />
                <p>Adicione fotos CC0 usando o botão acima.</p>
              </div>
            )}
            <div className="photoGrid">
              {draft.photos.map((photo, index) => (
                <article className="photoCard" key={photo.id}>
                  <div className="editorPhotoImage">
                    <img
                      loading="lazy"
                      src={`/photos/${photo.fileName}`}
                      alt={photo.caption || `${photo.taxonName} · iNaturalist`}
                      onError={(e) => {
                        e.currentTarget.style.opacity = "0.2";
                      }}
                    />
                    <div className="editorPhotoMarkers">
                      {photo.markers
                        .filter((marker) => marker !== "unknown")
                        .map((marker) => (
                          <span key={marker} title={markerLabels[marker]}>
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.7"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path
                                d={
                                  markerPaths[
                                    marker as Exclude<PhotoMarker, "unknown">
                                  ]
                                }
                              />
                            </svg>
                          </span>
                        ))}
                    </div>
                  </div>
                  <fieldset disabled={mediaBusy} className="photoFields">
                    <strong>CC0 · {photo.creator}</strong>
                    <small>{photo.taxonName}</small>
                    {!photoMatchesPlant(draft, photo.taxonName) && (
                      <div className="warning" role="status">
                        O nome no iNaturalist difere do nome da ficha. Pode ser
                        sinonímia ou uma diferença taxonômica.
                      </div>
                    )}
                    <a
                      href={photo.observationUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Observação #{photo.observationId} ↗
                    </a>
                    <label>
                      Legenda
                      <input
                        value={photo.caption}
                        onChange={(e) =>
                          edit(
                            "photos",
                            draft.photos.map((p, i) =>
                              i === index
                                ? { ...p, caption: e.target.value }
                                : p,
                            ),
                          )
                        }
                      />
                    </label>
                    <div className="markers">
                      {Object.entries(markerLabels)
                        .filter(([m]) => m !== "unknown")
                        .map(([marker, label]) => (
                          <label key={marker}>
                            <input
                              type="checkbox"
                              checked={photo.markers.includes(
                                marker as PhotoMarker,
                              )}
                              onChange={() => {
                                let markers: PhotoMarker[] =
                                  photo.markers.filter((m) => m !== "unknown");
                                markers = markers.includes(
                                  marker as PhotoMarker,
                                )
                                  ? markers.filter((m) => m !== marker)
                                  : [...markers, marker as PhotoMarker];
                                edit(
                                  "photos",
                                  draft.photos.map((p, i) =>
                                    i === index
                                      ? {
                                          ...p,
                                          markers: markers.length
                                            ? markers
                                            : ["unknown"],
                                        }
                                      : p,
                                  ),
                                );
                              }}
                            />
                            <svg
                              width="15"
                              height="15"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.7"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <path
                                d={
                                  markerPaths[
                                    marker as Exclude<PhotoMarker, "unknown">
                                  ]
                                }
                              />
                            </svg>
                            {label}
                          </label>
                        ))}
                    </div>
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={photo.reviewStatus === "reviewed"}
                        onChange={(e) =>
                          edit(
                            "photos",
                            draft.photos.map((p, i) =>
                              i === index
                                ? {
                                    ...p,
                                    reviewStatus: e.target.checked
                                      ? "reviewed"
                                      : "draft",
                                  }
                                : p,
                            ),
                          )
                        }
                      />
                      Foto e identificação revisadas
                    </label>
                    <div className="actions">
                      <button
                        type="button"
                        disabled={busy || mediaBusy}
                        onClick={() =>
                          setPhotoImport({
                            replaceId: photo.id,
                            observationId: photo.observationId,
                            key: Date.now(),
                          })
                        }
                      >
                        Substituir
                      </button>
                      <button
                        type="button"
                        disabled={index === 0 || busy || mediaBusy}
                        onClick={() =>
                          edit("photos", [
                            photo,
                            ...draft.photos.filter((_, i) => i !== index),
                          ])
                        }
                      >
                        Usar como primeira
                      </button>
                      <button
                        disabled={index === 0 || mediaBusy}
                        onClick={() => {
                          const photos = [...draft.photos];
                          [photos[index - 1], photos[index]] = [
                            photos[index],
                            photos[index - 1],
                          ];
                          edit("photos", photos);
                        }}
                      >
                        ← Antes
                      </button>
                      <button
                        disabled={
                          index === draft.photos.length - 1 || mediaBusy
                        }
                        onClick={() => {
                          const photos = [...draft.photos];
                          [photos[index], photos[index + 1]] = [
                            photos[index + 1],
                            photos[index],
                          ];
                          edit("photos", photos);
                        }}
                      >
                        Depois →
                      </button>
                      <button
                        disabled={mediaBusy}
                        aria-label={`Remover foto ${index + 1}`}
                        onClick={() =>
                          edit(
                            "photos",
                            draft.photos.filter((_, i) => i !== index),
                          )
                        }
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </fieldset>
                </article>
              ))}
            </div>
            <a
              href={`https://www.inaturalist.org/observations?taxon_name=${encodeURIComponent(draft.rank === "genus" ? draft.genus : draft.scientificName)}&photo_license=cc0&quality_grade=research`}
              target="_blank"
              rel="noreferrer"
            >
              Pesquisar outras fotos CC0 no iNaturalist ↗
            </a>
          </section>
          <section>
            <h2>Fontes e composição do grupo</h2>
            <p className="subtle">
              Membros de grupos contam individualmente para o limite de 1.500.
              Não inclua uma espécie também em outra ficha. As contagens são do
              estado, sem implicar ocorrência no município.
            </p>
            <textarea
              className="json"
              spellCheck={false}
              aria-label="Fontes e espécies regionais em JSON"
              rows={14}
              value={advancedJson}
              onChange={(e) => {
                setAdvancedJson(e.target.value);
                setAdvancedChanged(true);
              }}
            />
          </section>
        </main>
      </div>
    </div>
  );
}
