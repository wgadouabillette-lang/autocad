import clsx from "clsx";
import { Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

export interface SearchSuggestionItem {
  id: string;
  label: string;
  hint: string;
}

export default function ExpandableSearchDropdown<T extends SearchSuggestionItem>({
  placeholder,
  ariaLabel,
  filterSuggestions,
  onSelect,
}: {
  placeholder: string;
  ariaLabel: string;
  filterSuggestions: (query: string) => T[];
  onSelect: (item: T) => void;
}) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const suggestions = useMemo(() => filterSuggestions(query), [filterSuggestions, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open, suggestions]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const selectSuggestion = (item: T) => {
    onSelect(item);
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!open && (event.key === "ArrowDown" || event.key === "Enter")) {
      setOpen(true);
      return;
    }
    if (!open || suggestions.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = suggestions[activeIndex];
      if (item) selectSuggestion(item);
    } else if (event.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const panelContent =
    suggestions.length === 0 ? (
      <p className="expandable-search__empty">Aucun résultat</p>
    ) : (
      <ul className="expandable-search__list" role="listbox">
        {suggestions.map((item, index) => (
          <li key={item.id} role="option" aria-selected={index === activeIndex}>
            <button
              type="button"
              className={clsx(
                "expandable-search__item",
                index === activeIndex && "expandable-search__item--active",
              )}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => selectSuggestion(item)}
            >
              <span className="expandable-search__item-label">{item.label}</span>
              <span className="expandable-search__item-hint">{item.hint}</span>
            </button>
          </li>
        ))}
      </ul>
    );

  return (
    <div
      ref={rootRef}
      className={clsx("expandable-search", "expandable-search--settings", open && "expandable-search--open")}
    >
      <form
        className="expandable-search__bar"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          if (suggestions[activeIndex]) selectSuggestion(suggestions[activeIndex]);
        }}
      >
        <Search size={13} className="expandable-search__icon shrink-0" aria-hidden />
        <input
          ref={inputRef}
          type="search"
          className="expandable-search__input"
          placeholder={placeholder}
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          aria-autocomplete="list"
          role="combobox"
          value={query}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
      </form>
      {open && (
        <div id={listboxId} className="expandable-search__panel">
          {panelContent}
        </div>
      )}
    </div>
  );
}
