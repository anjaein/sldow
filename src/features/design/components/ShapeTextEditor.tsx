import { useRef } from 'react';
import type { Shape } from '../types';
import { clampTextOffset } from '../geometry';

const INPUT_HEIGHT = 28;

interface ShapeTextEditorProps {
  shape: Shape;
  onCommit: (content: string) => void;
  onCancel: () => void;
}

// 도형 위에 겹쳐 놓는 글자 입력칸. 글자가 놓인 자리에서 바로 고친다.
export default function ShapeTextEditor({
  shape,
  onCommit,
  onCancel,
}: ShapeTextEditorProps) {
  const cancelled = useRef(false);
  const { dx, dy } = clampTextOffset(shape, shape.text);

  return (
    <foreignObject
      x={shape.x + dx}
      y={shape.y + shape.h / 2 + dy - INPUT_HEIGHT / 2}
      width={shape.w}
      height={INPUT_HEIGHT}
    >
      <input
        className="design-text-input"
        aria-label="도형 글자"
        defaultValue={shape.text.content}
        autoFocus
        // Esc가 편집 창까지 닫지 않게 Mantine에 알린다.
        data-mantine-stop-propagation="true"
        onFocus={(event) => event.target.select()}
        // 입력칸을 누른 것이 캔버스의 끌기로 이어지지 않게 한다.
        onPointerDown={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onBlur={(event) => {
          if (cancelled.current) onCancel();
          else onCommit(event.target.value);
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
    </foreignObject>
  );
}
