type ChipRowProps = {
  items: string[];
  wrapperClassName: string; // required, not defaulted — `.chips-wrap` and `.option-card-sigs`
                              // are genuinely different CSS, don't silently pick one as a default
  itemClassName?: string; // default 'chip-tag' — /identity's Friction Points section uses
                            // 'chip-friction' instead
};

export default function ChipRow({ items, wrapperClassName, itemClassName }: ChipRowProps) {
  return (
    <div className={wrapperClassName}>
      {items.map(item => (
        <span key={item} className={itemClassName ?? 'chip-tag'}>{item}</span>
      ))}
    </div>
  );
}
