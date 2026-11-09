export default function ToolButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="design-tool"
      aria-pressed={active}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
