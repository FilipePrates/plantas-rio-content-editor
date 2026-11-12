import React, { useEffect, useRef, useState } from "react";
import {
  Download,
  Flower2,
  Leaf,
  Plus,
  Save,
  Search,
  Upload,
  UsersRound,
  RefreshCw,
  ArrowLeft,
  LogOut,
  Replace,
  Star,
  ArrowRight,
  Trash2,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {
  photoLicenseLabel,
  photoLicenseUrl,
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
import { VocabularySelect } from "./VocabularySelect";
import { ObservationImporter } from "./ObservationImporter";
import {cloudMode,loadSharedCatalog,saveSharedPlant,membership} from './cloud';
import {CloudPhoto} from './CloudPhoto';
import {EditorialPanel,MembersPanel} from './EditorialPanel';
import { Brand, BrandMark } from './Brand';

const clone = <T,>(value: T): T => structuredClone(value);
export default function App({onSignOut}:{onSignOut?:()=>void}={}) {
  const [membersScreen,setMembersScreen]=useState(false);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [draft, setDraft] = useState<Plant | null>(null);
  const [query, setQuery] = useState("");
  const [photoSearchLicense, setPhotoSearchLicense] = useState("cc0,cc-by");
  const [family, setFamily] = useState("");
  const [showFamilyFilter,setShowFamilyFilter]=useState(false);
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
  const photoImportPanel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (photoImport) photoImportPanel.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [photoImport]);
  const dirty = Boolean(
    draft && (JSON.stringify(draft) !== initialDraft || advancedChanged),
  );
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const local = cloudMode ? await loadSharedCatalog() : await loadCatalog();
      const response = local ? null : await fetch("/catalog.json");
      if (response && !response.ok)
        throw new Error("Não foi possível carregar o catálogo inicial.");
      const value = local || parseCatalog(await response!.json());
      if (!cancelled) {
        setCatalog(value);
        select(value.plants[0]);
        setNotice(
          cloudMode ? 'Catálogo compartilhado carregado. Salvar ficha registra uma nova revisão.' : local
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
          regionalEvidence: value.regionalEvidence ?? [],
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
    if(cloudMode)throw Error('A importação completa é feita pelo administrador durante a configuração.');
    const valid = parseCatalog(next);
    await storeCatalog(valid); // Publish UI state only after durable IndexedDB commit.
    setCatalog(valid);
    setNotice(message);
  }
  async function save(editorialState='draft') {
    if (!catalog || !draft) return;
    setBusy(true);
    setError("");
    try {
      const extra = advancedChanged
        ? JSON.parse(advancedJson)
        : {
            sources: draft.sources,
            regionalSpecies: draft.regionalSpecies,
            regionalEvidence: draft.regionalEvidence ?? [],
            floraId: draft.floraId,
            curationNotes: draft.curationNotes,
          };
      const plant: Plant = {
        ...draft,
        commonName: draft.commonName.trim().toLocaleLowerCase("pt-BR") === draft.scientificName.trim().toLocaleLowerCase("pt-BR") ? "" : draft.commonName.trim(),
        sources: extra.sources,
        regionalSpecies: extra.regionalSpecies,
        regionalEvidence: extra.regionalEvidence ?? draft.regionalEvidence,
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
      if(cloudMode){
        parseCatalog(next);
        const shared=await saveSharedPlant(plant,editorialState);
        setCatalog({...next,plants:next.plants.map(item=>item.id===shared.id?shared:item)});
        select(shared);setNotice(`${shared.commonName || shared.scientificName}: salvo no catálogo compartilhado.`);
      }else{
        await persist(next, `${plant.commonName || plant.scientificName}: salvo neste navegador.`);
        select(plant);
      }
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
  async function exportCatalog() {
    if (!catalog) return;
    if (dirty) {
      setError("Salve a ficha ou descarte as alterações antes de exportar.");
      return;
    }
    let exportValue=catalog;
    if(cloudMode){
      try{setBusy(true);exportValue=await loadSharedCatalog();setCatalog(exportValue);select(exportValue.plants.find(p=>p.id===draft?.id)||exportValue.plants[0]);}
      catch(error){setError(String(error));return;}
      finally{setBusy(false);}
    }
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(parseCatalog(exportValue), null, 2) + "\n"], {
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
        <BrandMark />
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
      (!origin || (origin === 'native' ? p.origin === 'native' : p.origin !== 'native')) &&
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
        <Brand subtitle={`Editor de conteúdo · ${cloudMode ? 'catálogo compartilhado' : 'rascunho local'}`} />
        <div className="actions">
          {cloudMode&&<button disabled={busy||mediaBusy} onClick={async()=>{if(!canLeave())return;setBusy(true);try{const fresh=await loadSharedCatalog();setCatalog(fresh);select(fresh.plants.find(p=>p.id===draft.id)||fresh.plants[0]);setNotice('Catálogo atualizado.')}catch(e){setError(String(e))}finally{setBusy(false)}}}><RefreshCw size={17}/>Atualizar catálogo</button>}
          {cloudMode&&membership?.role==='admin'&&<button disabled={busy||mediaBusy} onClick={()=>setMembersScreen(!membersScreen)}>{membersScreen?<ArrowLeft size={17}/>:<UsersRound size={17}/>} {membersScreen?'Voltar ao editor':'Colaboradores'}</button>}
          {!membersScreen&&<>
          <button
            disabled={busy || mediaBusy}
            onClick={() => {if(!cloudMode)importInput.current?.click();else setError('A importação completa exige a rotina de administração.');}}
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
            onClick={()=>void save()}
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
          </>}
          {onSignOut&&<button disabled={busy||mediaBusy} onClick={()=>{if(!dirty||window.confirm('Sair e descartar as alterações ainda não salvas?'))onSignOut()}}><LogOut size={17}/>Sair</button>}
        </div>
      </header>
      {membersScreen&&cloudMode&&membership?.role==='admin'&&<MembersPanel/>}
      <div className="workspace" hidden={membersScreen}>
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
          <div className="sidebarSearchRow">
          <div className="search">
            <Search size={17} />
            <input
              aria-label="Buscar plantas"
              placeholder="Nome, espécie ou família"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <button className="familyFilterToggle" aria-label="Filtrar por família" title={family||'Filtrar por família'} aria-expanded={showFamilyFilter} aria-pressed={Boolean(family)} disabled={busy||mediaBusy} onClick={()=>setShowFamilyFilter(!showFamilyFilter)}><SlidersHorizontal size={16}/></button>
          </div>
          {showFamilyFilter&&<select
            disabled={busy || mediaBusy}
            aria-label="Filtrar família"
            value={family}
            onChange={(e) => {setFamily(e.target.value);setShowFamilyFilter(false)}}
          >
            <option value="">Todas as famílias</option>
            {families.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>}
          {family&&!showFamilyFilter&&<button className="activeFamilyFilter" aria-label="Limpar filtro de família" onClick={()=>setFamily('')}><span>{family}</span><X size={13}/></button>}
          <div className="sidebarFilters">
            <div className="sidebarFilterGroup originFilters" role="group" aria-label="Filtrar origem">
              <button disabled={busy||mediaBusy} aria-pressed={origin==='native'} onClick={()=>setOrigin(origin==='native'?'':'native')}>Nativas</button>
              <button disabled={busy||mediaBusy} aria-pressed={origin==='exotic'} onClick={()=>setOrigin(origin==='exotic'?'':'exotic')}>Exóticas / invasoras</button>
            </div>
            <div className="sidebarFilterGroup" role="group" aria-label="Filtrar revisão">
              <button disabled={busy||mediaBusy} aria-pressed={status==='draft'} onClick={()=>setStatus(status==='draft'?'':'draft')}>Rascunhos</button>
              <button disabled={busy||mediaBusy} aria-pressed={status==='reviewed'} onClick={()=>setStatus(status==='reviewed'?'':'reviewed')}>Revisadas</button>
            </div>
          </div>
          <p className="subtle sidebarResults" role="status">{visible.length} resultados</p>
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
                    <CloudPhoto
                      key={p.photos[0].fileName}
                      fileName={p.photos[0].fileName}
                      thumbnail
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
                  {p.commonName && <strong>{p.commonName}</strong>}
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
              <h1>{draft.commonName || <i className="scientificName">{draft.scientificName || "Nova planta"}</i>}</h1>
              {draft.commonName && <p>
                <i>{draft.scientificName}</i>
              </p>}
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
          <section className="identitySection">
            <h2>Identidade</h2>
            <div className="formGrid identityGrid">
              {field("commonName", "Nome comum principal (opcional)")}
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
                  disabled={busy || mediaBusy || (cloudMode&&membership?.role==='contributor')}
                  value={draft.reviewStatus}
                  aria-readonly={cloudMode&&membership?.role==='contributor'}
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
          <section className="profileTextSection">
            <h2>Texto do perfil</h2>
            <div className="profileTextGrid">
            {field("description", "Descrição", true)}
            {field("identification", "Como reconhecer", true)}
            {field("ecology", "Ambiente e ecologia", true)}
            </div>
            <div className="formGrid vocabularyGrid">
              {([
                ["lifeForms", "Formas de vida"],
                ["substrates", "Substratos"],
                ["habitats", "Fitofisionomias / vegetação e ambientes"],
              ] as const).map(([key, label]) => (
                <VocabularySelect
                  key={`${draft.id}-${key}`}
                  label={label}
                  values={draft[key]}
                  options={catalog.plants.flatMap(plant => plant[key])}
                  disabled={busy || mediaBusy}
                  onChange={values => edit(key, values)}
                />
              ))}
            </div>
          </section>
          <section>
            <h2>
              <Flower2 size={21} /> Fotos e estruturas
            </h2>
            <p className="subtle">
              Fotos CC0 ou CC BY 4.0 do iNaturalist, com créditos preservados. Flor e fruto devem ser marcados
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
              <div ref={photoImportPanel} className="photoImportPanel">
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
              </div>
            )}
            {!draft.photos.length && (
              <div className="empty">
                <Leaf size={40} />
                <p>Adicione fotos CC0 ou CC BY usando o botão acima.</p>
              </div>
            )}
            <div className="photoGrid">
              {draft.photos.map((photo, index) => (
                <article className="photoCard" key={photo.id}>
                  <div className="editorPhotoImage">
                    <span className="photoOrder">Foto {index+1}{index===0?' · Principal':''}</span>
                    <CloudPhoto
                      loading="lazy"
                      fileName={photo.fileName}
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
                    <div className="photoMetadata">
                    <strong>{photoLicenseLabel(photo)} · {photo.creator}</strong>
                    {photo.attribution && <small>{photo.attribution}</small>}
                    <div className="photoSourceLinks">
                    <a href={photoLicenseUrl(photo)} target="_blank" rel="noreferrer">Licença ↗</a>
                    {photo.photoPageUrl && <a href={photo.photoPageUrl} target="_blank" rel="noreferrer">Página da foto ↗</a>}
                    <a href={photo.observationUrl} target="_blank" rel="noreferrer">Observação #{photo.observationId} ↗</a>
                    </div>
                    {photo.licenseCode === "cc-by" && <small>Miniaturas redimensionadas e recortadas; créditos e licença acompanham o export.</small>}
                    <small>{photo.taxonName}</small>
                    </div>
                    {!photoMatchesPlant(draft, photo.taxonName) && (
                      <div className="warning" role="status">
                        O nome no iNaturalist difere do nome da ficha. Pode ser
                        sinonímia ou uma diferença taxonômica.
                      </div>
                    )}
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
                        disabled={cloudMode&&membership?.role==='contributor'}
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
                    <div className="actions photoActions">
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
                        <Replace size={15}/> Substituir
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
                        <Star size={15}/> Usar como primeira
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
                        <ArrowLeft size={15}/> Antes
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
                        Depois <ArrowRight size={15}/>
                      </button>
                      <button
                        disabled={mediaBusy}
                        aria-label={`Remover foto ${index + 1}`}
                        className="removePhoto"
                        onClick={() =>
                          edit(
                            "photos",
                            draft.photos.filter((_, i) => i !== index),
                          )
                        }
                      >
                        <Trash2 size={15} /> Remover foto
                      </button>
                    </div>
                    <div className="photoObservationActions">
                      <button
                        type="button"
                        disabled={busy || mediaBusy}
                        onClick={() => setPhotoImport({ replaceId: null, observationId: photo.observationId, key: Date.now() })}
                      >
                        <Search size={15} /> Buscar mais fotos desta observação
                      </button>
                      {draft.photos.filter(p => p.observationId === photo.observationId).length > 1 && (
                        <button
                          type="button"
                          className="removeObservation"
                          disabled={busy || mediaBusy}
                          onClick={() => {
                            if (window.confirm("Remover desta ficha todas as fotos desta observação?"))
                              edit("photos", draft.photos.filter(p => p.observationId !== photo.observationId));
                          }}
                        >
                          <Trash2 size={15} /> Remover todas desta observação
                        </button>
                      )}
                    </div>
                  </fieldset>
                </article>
              ))}
            </div>
            <label>
              Licença das fotos na busca
              <select value={photoSearchLicense} onChange={event => setPhotoSearchLicense(event.target.value)}>
                <option value="cc0,cc-by">CC0 e CC BY 4.0</option>
                <option value="cc0">Somente CC0</option>
                <option value="cc-by">Somente CC BY 4.0</option>
              </select>
            </label>
            <p className="subtle">A licença de cada foto é verificada ao importar. CC BY-NC, CC BY-SA, CC BY-ND e outras licenças não são aceitas.</p>
            <a
              href={`https://www.inaturalist.org/observations?taxon_name=${encodeURIComponent(draft.rank === "genus" ? draft.genus : draft.scientificName)}&photo_license=${encodeURIComponent(photoSearchLicense)}&quality_grade=research`}
              target="_blank"
              rel="noreferrer"
            >
              Pesquisar fotos no iNaturalist ↗
            </a>
          </section>
          <section>
            <h2>Fontes, conservação e composição do grupo</h2>
            <p className="subtle">
              Membros de grupos contam individualmente para o limite de 1.500.
              Não inclua uma espécie também em outra ficha. As contagens são do
              estado, sem implicar ocorrência no município. Registros de conservação
              mantêm espécie, fonte, abrangência e ano da referência.
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
          {cloudMode&&<EditorialPanel key={draft.id} plant={draft} busy={busy||mediaBusy} onRestore={plant=>{if(canLeave()){select(plant);setInitialDraft('');setNotice('Versão anterior carregada como rascunho. Clique em Salvar ficha para confirmar.')}}} onSubmit={()=>void save('submitted')} onApprove={()=>void save('approved')}/>}
        </main>
      </div>
    </div>
  );
}
