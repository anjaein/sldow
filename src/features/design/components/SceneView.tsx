import { useId } from 'react';
import type { Connector, Scene, Shape } from '../types';
import { getSquirclePath } from '../squircle';
import { getConnectorPath } from '../connector';
import { clampTextOffset } from '../geometry';

const STROKE = '#111111';
const STROKE_WIDTH = 1.5;

// 장면의 도형과 선을 그린다. <svg> 안에 넣어 쓰므로 미리보기·편집 창·애니메이션이 같이 쓴다.
export default function SceneView({
  scene,
  interactive = false,
}: {
  scene: Scene;
  // 편집 창에서만 선을 쉽게 누를 수 있는 투명한 영역을 함께 그린다.
  interactive?: boolean;
}) {
  // 한 페이지에 디자인 블록이 여러 개여도 화살표 marker id가 겹치지 않게 한다.
  const arrowId = `arrow-${useId()}`;

  return (
    <g>
      <defs>
        <marker
          id={arrowId}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          markerUnits="userSpaceOnUse"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={STROKE} />
        </marker>
      </defs>
      {scene.elements.map((element) =>
        element.kind === 'shape' ? (
          <ShapeView key={element.id} shape={element} />
        ) : (
          <ConnectorView
            key={element.id}
            connector={element}
            arrowId={arrowId}
            interactive={interactive}
          />
        ),
      )}
    </g>
  );
}

function ShapeView({ shape }: { shape: Shape }) {
  const { x, y, w, h, fill, text } = shape;
  // 도형을 줄여도 글자가 도형 밖으로 나가지 않게 한다.
  const { dx, dy } = clampTextOffset(shape, text);
  return (
    // 편집 창이 눌린 도형을 찾을 수 있게 id를 남긴다.
    <g data-shape-id={shape.id}>
      <path
        d={getSquirclePath(x, y, w, h)}
        fill={fill ?? '#ffffff'}
        stroke={STROKE}
        strokeWidth={STROKE_WIDTH}
      />
      {text.content && (
        <text
          data-shape-text
          x={x + w / 2 + dx}
          y={y + h / 2 + dy}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={14}
          fill={STROKE}
        >
          {text.content}
        </text>
      )}
    </g>
  );
}

function ConnectorView({
  connector,
  arrowId,
  interactive,
}: {
  connector: Connector;
  arrowId: string;
  interactive: boolean;
}) {
  const d = getConnectorPath(connector);
  return (
    <g data-connector-id={connector.id}>
      <path
        d={d}
        fill="none"
        stroke={STROKE}
        strokeWidth={STROKE_WIDTH}
        strokeLinecap="round"
        strokeDasharray={connector.dashed ? '6 6' : undefined}
        markerEnd={connector.arrowEnd ? `url(#${arrowId})` : undefined}
      />
      {/* 겹침 순서를 지키도록 선과 같은 자리에서 그린다. */}
      {interactive && <path className="design-connector-hit" d={d} />}
    </g>
  );
}
