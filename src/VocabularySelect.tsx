import { useId, useState } from "react";
import { normalize } from "./catalog.mjs";

/** Suggestions come from the catalog; existing/custom values remain editable. */
export function VocabularySelect({ label, values, options, disabled, onChange }: {
  label: string;
  values: string[];
  options: string[];
  disabled: boolean;
  onChange: (values: string[]) => void;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const choices = [...new Set([...options, ...values])].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const trimmed = query.trim();
  const existing = choices.find(value => normalize(value) === normalize(trimmed));
  function add() {
    if (!trimmed) return;
    const value = existing ?? trimmed;
    if (!values.includes(value)) onChange([...values, value]);
    setQuery("");
  }
  return (
    <fieldset className="vocabulary" disabled={disabled}>
      <legend>{label}</legend>
      <label htmlFor={id}>Buscar ou adicionar</label>
      <div className="vocabularyInput">
        <input id={id} value={query} placeholder="Digite para filtrar ou criar"
          onChange={event => setQuery(event.target.value)}
          onKeyDown={event => {
            if (event.key === "Enter") { event.preventDefault(); add(); }
          }} />
        <button type="button" disabled={disabled || !trimmed || Boolean(existing && values.includes(existing))} onClick={add}>
          {existing ? "Selecionar" : "Adicionar"}
        </button>
      </div>
      <small>{values.length} selecionado(s). Novos termos ficam disponíveis após salvar a ficha.</small>
      <div className="vocabularyChoices">
        {choices.filter(value => values.includes(value) || normalize(value).includes(normalize(query))).map(value => (
          <label key={value}>
            <input type="checkbox" checked={values.includes(value)} onChange={event =>
              onChange(event.target.checked ? [...values, value] : values.filter(item => item !== value))} />
            {value}
          </label>
        ))}
        {!choices.length && <small>Nenhum termo cadastrado.</small>}
      </div>
    </fieldset>
  );
}
