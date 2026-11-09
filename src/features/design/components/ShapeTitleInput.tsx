import { useRef } from 'react';

interface ShapeTitleInputProps {
  title: string;
  onCommit: (title: string) => void;
}

// 툴바의 제목 입력칸. 포커스를 벗어나거나 Enter를 누르면 반영한다.
export default function ShapeTitleInput({
  title,
  onCommit,
}: ShapeTitleInputProps) {
  const cancelled = useRef(false);

  return (
    <input
      className="design-title-input"
      aria-label="박스 제목"
      placeholder="제목"
      defaultValue={title}
      // Esc가 편집 창까지 닫지 않게 Mantine에 알린다.
      data-mantine-stop-propagation="true"
      onBlur={(event) => {
        if (cancelled.current) {
          cancelled.current = false;
          event.target.value = title;
        } else if (event.target.value !== title) {
          onCommit(event.target.value);
        }
      }}
      onKeyDown={(event) => {
        // 한글 조합을 끝내는 Enter·Esc는 입력 종료로 보지 않는다.
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'Escape') cancelled.current = true;
        if (event.key === 'Enter' || event.key === 'Escape') {
          event.currentTarget.blur();
        }
      }}
    />
  );
}
