type SelectableListProps = {
  items: string[];
  selected: string[];
  onToggle: (item: string) => void;
  max: number;
  variant: 'positive' | 'negative'; // required, not defaulted — must-haves/must-avoids are
                                     // genuinely different semantics (reuses /identity's
                                     // energiser=green / friction=red color language)
  disabled?: boolean;
};

// #134 Slice 1 — Checkpoint 1 "Direction": a flat select-up-to-`max` list,
// replacing the old two-column "click to move into a slot" mechanic (brief
// §3) that didn't hold up for longer text / mobile. Once `max` items are
// selected, every unselected row disables until one is deselected.
export default function SelectableList({ items, selected, onToggle, max, variant, disabled }: SelectableListProps) {
  const atMax = selected.length >= max;

  return (
    <div className="selectable-list">
      {items.map(item => {
        const isSelected = selected.includes(item);
        return (
          <button
            key={item}
            type="button"
            className={`selectable-row selectable-row--${variant}${isSelected ? ' selected' : ''}`}
            onClick={() => onToggle(item)}
            disabled={disabled || (!isSelected && atMax)}
            aria-pressed={isSelected}
          >
            <span className="selectable-row-check" aria-hidden="true">{isSelected ? '✓' : ''}</span>
            <span>{item}</span>
          </button>
        );
      })}
    </div>
  );
}
