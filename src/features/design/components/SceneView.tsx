import { useId } from 'react';
import type { Connector, Scene, Shape, TextElement } from '../types';
import {
  TITLE_FONT_SIZE,
  TITLE_FONT_WEIGHT,
  getBoxTitle,
  getShapeOutlinePath,
  getShapePath,
} from '../box';
import { SCENE_FONT, measureTextHeight } from '../measure';
import { DEFAULT_RUN_STYLE, getRootFontSize, getRunStyle } from '../text';
import { getConnectorPath } from '../connector';
import { clampTextOffset } from '../geometry';

const STROKE = '#111111';
const STROKE_WIDTH = 1.5;
const DASH_ARRAYS = { solid: undefined, dashed: '6 6', dotted: '0 5' };

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
    <g fontFamily={SCENE_FONT}>
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
      {scene.elements.map((element) => {
        if (element.kind === 'shape') {
          return <ShapeView key={element.id} shape={element} />;
        }
        if (element.kind === 'text') {
          return <TextView key={element.id} text={element} />;
        }
        return (
          <ConnectorView
            key={element.id}
            connector={element}
            arrowId={arrowId}
            interactive={interactive}
          />
        );
      })}
    </g>
  );
}

function ShapeView({ shape }: { shape: Shape }) {
  const { x, y, w, h, fill, stroke, strokeStyle, text } = shape;
  const title = getBoxTitle(shape);
  // 도형을 줄여도 글자가 도형 밖으로 나가지 않게 한다.
  const { dx, dy } = clampTextOffset(shape, text);
  return (
    // 편집 창이 눌린 도형을 찾을 수 있게 id를 남긴다.
    <g data-shape-id={shape.id}>
      <path d={getShapePath(shape)} fill={fill ?? '#ffffff'} />
      <path
        d={getShapeOutlinePath(shape, title)}
        fill="none"
        stroke={stroke}
        strokeWidth={STROKE_WIDTH}
        strokeDasharray={DASH_ARRAYS[strokeStyle]}
        strokeLinecap={strokeStyle === 'dotted' ? 'round' : undefined}
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
      {title && (
        <text
          x={title.x}
          y={y}
          dominantBaseline="central"
          fontSize={TITLE_FONT_SIZE}
          fontWeight={TITLE_FONT_WEIGHT}
          fill={stroke}
        >
          {title.text}
        </text>
      )}
    </g>
  );
}

function TextView({ text }: { text: TextElement }) {
  return (
    <foreignObject
      x={text.x}
      y={text.y}
      width={text.w}
      height={measureTextHeight(text)}
    >
      <div
        className="design-text"
        data-text-id={text.id}
        style={{
          fontSize: `${getRootFontSize(text.runs, DEFAULT_RUN_STYLE)}px`,
        }}
      >
        {text.runs.map(({ text: content, ...style }, index) => (
          <span key={index} style={getRunStyle(style)}>
            {content}
          </span>
        ))}
      </div>
    </foreignObject>
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
