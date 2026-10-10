interface DocumentTitleProps {
  title: string;
}

export default function DocumentTitle({ title }: DocumentTitleProps) {
  return (
    <input
      aria-label="문서 제목"
      defaultValue={title}
      placeholder="제목 없음"
      style={{ width: '100%', minWidth: 0 }}
    />
  );
}
