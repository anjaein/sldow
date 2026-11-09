import { useRef } from 'react';
import type { Connector } from '../types';
import { getLabelLayout } from '../connector';

const INPUT_WIDTH = 160;
const INPUT_HEIGHT = 24;

interface ConnectorLabelEditorProps {
  connector: Connector;
  onCommit: (label: string) => void;
  onCancel: () => void;
}

// 선의 라벨 입력칸. 라벨이 놓이는 자리에서 바로 고친다.
export default function ConnectorLabelEditor({
  connector,
  onCommit,
  onCancel,
}: ConnectorLabelEditorProps) {
  const cancelled = useRef(false);
  const { x, y } = getLabelLayout(connector, connector.label);

  return (
    <foreignObject
      x={x - INPUT_WIDTH / 2}
      y={y - INPUT_HEIGHT / 2}
      width={INPUT_WIDTH}
      height={INPUT_HEIGHT}
    >
      <input
        className="design-text-input"
        aria-label="선 라벨"
        defaultValue={connector.label}
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
