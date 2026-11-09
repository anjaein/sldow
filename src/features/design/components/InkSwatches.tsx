import { INK } from '../types';

interface InkSwatchesProps {
  label: string;
  value: string | null | undefined;
  onPick: (color: string) => void;
}

export default function InkSwatches({
  label,
  value,
  onPick,
}: InkSwatchesProps) {
  return (
    <div className="design-toolbar-group" aria-label={label}>
      {INK.map((color) => (
        <button
          key={color}
          type="button"
          className="design-swatch"
          style={{ background: color }}
          aria-label={`${label} ${color}`}
          aria-pressed={value === color}
          onClick={() => onPick(color)}
        />
      ))}
    </div>
  );
}
