import { useEffect, useId, useRef, useState } from 'react';
import type { MouseEvent, PointerEvent } from 'react';
import { animate } from 'motion';
import type { AnimationPlaybackControls } from 'motion';
import type { Connector, Point, Scene } from '../types';
import { findElement, updateShape } from '../types';
import type { Corner, Rect } from '../geometry';
import {
  CORNERS,
  GRID_SIZE,
  getCornerPoint,
  getOppositeCorner,
  mixScene,
} from '../geometry';
import type { Drag } from '../drag';
import { getDragScenes } from '../drag';
import { getConnectorPath } from '../connector';
import SceneView from './SceneView';
import ShapeTextEditor from './ShapeTextEditor';

export type Tool = 'select' | 'shape' | 'line';

// 이보다 적게 움직이면 끈 것이 아니라 누른 것으로 본다.
const DRAG_THRESHOLD = 4;

interface DesignCanvasProps {
  scene: Scene;
  onChange: (scene: Scene) => void;
  // 도형과 선 중 선택된 것의 id
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  tool: Tool;
  // 도형이나 선을 하나 만들면 선택 도구로 돌아간다.
  onToolDone: () => void;
}

// 편집 창의 캔버스. 흰 바탕에 점 격자를 깔고 그 위에 장면과 선택 표시를 그린다.
export default function DesignCanvas({
  scene,
  onChange,
  selectedId,
  onSelect,
  tool,
  onToolDone,
}: DesignCanvasProps) {
  const gridId = `grid-${useId()}`;
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  // 글자를 입력 중인 도형의 id
  const [editingId, setEditingId] = useState<string | null>(null);
  // 놓은 뒤 격자 자리로 스프링처럼 붙는 동안, 놓은 순간의 장면과 진행 정도
  const [settle, setSettle] = useState<{ from: Scene; t: number } | null>(null);
  const settleAnimation = useRef<AnimationPlaybackControls>(null);

  useEffect(() => () => settleAnimation.current?.stop(), []);

  // 포인터를 움직이지 않고 Alt만 눌렀다 떼도 바로 반영한다.
  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Alt') return;
      event.preventDefault();
      setDrag((drag) => drag && { ...drag, snap: !event.altKey });
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    };
  }, [dragging]);

  function getPoint(event: PointerEvent): Point {
    const bounds = svgRef.current!.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  function settleFrom(from: Scene) {
    settleAnimation.current = animate(0, 1, {
      type: 'spring',
      stiffness: 600,
      damping: 32,
      onUpdate: (t) => setSettle({ from, t }),
      onComplete: () => setSettle(null),
    });
  }

  function handlePointerDown(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return;
    settleAnimation.current?.stop();
    setSettle(null);

    const point = getPoint(event);
    const base = { start: point, point, moved: false, snap: !event.altKey };
    const target = event.target as Element;
    const corner = target.closest<SVGElement>('[data-handle]')?.dataset
      .handle as Corner | undefined;
    const end = target.closest<SVGElement>('[data-end]')?.dataset.end as
      'from' | 'to' | undefined;
    const connectorId = target.closest<SVGElement>('[data-connector-id]')
      ?.dataset.connectorId;
    const shapeId =
      target.closest<SVGElement>('[data-shape-id]')?.dataset.shapeId;
    const shape = findElement(scene, 'shape', shapeId);
    const connector = findElement(scene, 'connector', connectorId);

    if (corner && selectedId) {
      const selected = findElement(scene, 'shape', selectedId)!;
      const anchor = getCornerPoint(selected, getOppositeCorner(corner));
      setDrag({ ...base, kind: 'resize', id: selectedId, anchor });
    } else if (end && selectedId) {
      setDrag({ ...base, kind: 'line-end', id: selectedId, end });
    } else if (tool === 'shape') {
      setDrag({
        ...base,
        kind: 'create',
        id: crypto.randomUUID(),
        anchor: point,
      });
    } else if (tool === 'line') {
      setDrag({
        ...base,
        kind: 'line-create',
        id: crypto.randomUUID(),
        anchor: point,
      });
    } else if (
      shape?.id === selectedId &&
      target.closest('[data-shape-text]')
    ) {
      // 이미 선택한 도형의 글자를 끌면 글자만 옮긴다.
      setDrag({ ...base, kind: 'text-move', shape: shape! });
    } else if (connector) {
      onSelect(connector.id);
      setDrag({
        ...base,
        kind: 'line-move',
        id: connector.id,
        from: connector,
      });
    } else if (shape) {
      onSelect(shape.id);
      setDrag({ ...base, kind: 'move', id: shape.id, from: shape });
    } else {
      onSelect(null);
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleDoubleClick(event: MouseEvent<SVGSVGElement>) {
    if (tool !== 'select') return;
    // 포인터 캡처 때문에 event.target이 svg가 되므로 실제 눌린 요소를 다시 찾는다.
    const id = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<SVGElement>('[data-shape-id]')?.dataset.shapeId;
    if (!id) return;
    onSelect(id);
    setEditingId(id);
  }

  function commitText(id: string, content: string) {
    setEditingId(null);
    const shape = findElement(scene, 'shape', id);
    if (!shape || shape.text.content === content) return;
    onChange(updateShape(scene, id, { text: { ...shape.text, content } }));
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    if (!drag) return;
    const point = getPoint(event);
    const moved =
      drag.moved ||
      Math.hypot(point.x - drag.start.x, point.y - drag.start.y) >
        DRAG_THRESHOLD;
    setDrag({ ...drag, point, moved, snap: !event.altKey });
  }

  function handlePointerUp(event: PointerEvent<SVGSVGElement>) {
    if (!drag) return;
    setDrag(null);
    const finished = { ...drag, snap: !event.altKey };
    const creating =
      finished.kind === 'create' || finished.kind === 'line-create';
    // 선은 누르기만 해서는 만들지 않는다. 도형은 기본 크기로 만든다.
    if (!finished.moved && finished.kind !== 'create') return;

    const { raw, target } = getDragScenes(scene, finished);
    // 격자에 붙으면서 양 끝이 겹치는 선은 보이지 않으므로 반영하지 않는다.
    if (finished.kind === 'line-create' || finished.kind === 'line-end') {
      const line = findElement(target, 'connector', finished.id);
      if (line?.from.x === line?.to.x && line?.from.y === line?.to.y) return;
    }
    onChange(target);
    if (finished.moved) settleFrom(raw);
    if (creating) {
      onSelect(finished.id);
      onToolDone();
    }
  }

  // 끄는 중이거나 자리잡는 중이면 저장된 위치 대신 화면용 위치로 그린다.
  let displayScene = scene;
  if (drag?.moved) {
    displayScene = getDragScenes(scene, drag).raw;
  } else if (settle) {
    displayScene = mixScene(settle.from, scene, settle.t);
  }

  // 입력하는 동안에는 입력칸만 보이게 도형의 글자를 숨긴다.
  const editingShape = findElement(displayScene, 'shape', editingId);
  if (editingShape) {
    displayScene = updateShape(displayScene, editingShape.id, {
      text: { ...editingShape.text, content: '' },
    });
  }

  const selectedShape = findElement(displayScene, 'shape', selectedId);
  const selectedConnector = findElement(displayScene, 'connector', selectedId);

  return (
    <svg
      ref={svgRef}
      className="design-canvas"
      data-tool={tool}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => setDrag(null)}
      onDoubleClick={handleDoubleClick}
    >
      <defs>
        <pattern
          id={gridId}
          width={GRID_SIZE}
          height={GRID_SIZE}
          patternUnits="userSpaceOnUse"
        >
          <circle cx={0} cy={0} r={1} fill="#000" />
          <circle cx={GRID_SIZE} cy={0} r={1} fill="#000" />
          <circle cx={0} cy={GRID_SIZE} r={1} fill="#000" />
          <circle cx={GRID_SIZE} cy={GRID_SIZE} r={1} fill="#000" />
        </pattern>
      </defs>
      <rect
        width="100%"
        height="100%"
        fill={`url(#${gridId})`}
        className="design-canvas-grid"
        data-dragging={drag?.moved || undefined}
      />
      <SceneView scene={displayScene} interactive />
      {selectedShape && <ShapeSelection rect={selectedShape} />}
      {selectedConnector && (
        <ConnectorSelection connector={selectedConnector} />
      )}
      {editingShape && (
        <ShapeTextEditor
          key={editingShape.id}
          shape={editingShape}
          onCommit={(content) => commitText(editingShape.id, content)}
          onCancel={() => setEditingId(null)}
        />
      )}
    </svg>
  );
}

const HANDLE_SIZE = 8;

function ShapeSelection({ rect }: { rect: Rect }) {
  return (
    <g>
      <rect
        className="design-selection"
        x={rect.x}
        y={rect.y}
        width={rect.w}
        height={rect.h}
      />
      {CORNERS.map((corner) => {
        const { x, y } = getCornerPoint(rect, corner);
        return (
          <rect
            key={corner}
            className="design-handle"
            data-handle={corner}
            x={x - HANDLE_SIZE / 2}
            y={y - HANDLE_SIZE / 2}
            width={HANDLE_SIZE}
            height={HANDLE_SIZE}
            rx={2}
          />
        );
      })}
    </g>
  );
}

function ConnectorSelection({ connector }: { connector: Connector }) {
  return (
    <g>
      <path className="design-selection" d={getConnectorPath(connector)} />
      {(['from', 'to'] as const).map((end) => (
        <circle
          key={end}
          className="design-handle design-end-handle"
          data-end={end}
          cx={connector[end].x}
          cy={connector[end].y}
          r={HANDLE_SIZE / 2 + 1}
        />
      ))}
    </g>
  );
}
