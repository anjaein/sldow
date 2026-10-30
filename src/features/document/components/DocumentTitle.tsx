interface DocumentTitleProps {
  title: string;
  onChange: (title: string) => void;
}

export default function DocumentTitle({ title, onChange }: DocumentTitleProps) {
  return (
    <input
      aria-label="문서 제목"
      defaultValue={title}
      onChange={(event) => onChange(event.target.value)}
      placeholder="제목 없음"
      style={{ width: '100%', minWidth: 0 }}
    />
  );
}
