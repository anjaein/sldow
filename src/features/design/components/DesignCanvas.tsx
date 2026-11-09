import { useEffect, useId, useRef, useState } from 'react';
import type { MouseEvent, PointerEvent } from 'react';
import { animate } from 'motion';
import type { AnimationPlaybackControls } from 'motion';
import type { Connector, Point, Scene, TextElement, TextRun } from '../types';
import {
  createText,
  findElement,
  removeElement,
  updateConnector,
  updateShape,
  updateText,
} from '../types';
import { isRunsBlank, trimTrailingNewlines } from '../text';
import type { Corner, Rect } from '../geometry';
import {
  CORNERS,
  GRID_SIZE,
  getContainedElements,
  getCornerPoint,
  getOppositeCorner,
  getTextRect,
  mixScene,
  snapPoint,
} from '../geometry';
import type { Drag } from '../drag';
import { getDragScenes } from '../drag';
import type { Guide } from '../guides';
import { getConnectorPath, getControlHandle } from '../connector';
import SceneView from './SceneView';
import ShapeTextEditor from './ShapeTextEditor';
import ConnectorLabelEditor from './ConnectorLabelEditor';
import TextEditor from './TextEditor';

export type Tool = 'select' | 'shape' | 'line' | 'text';

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
  // 라벨을 입력 중인 선의 id
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  // 입력 중인 자유 텍스트. 새 글자는 입력을 마칠 때 장면에 넣는다.
  const [editingText, setEditingText] = useState<TextElement | null>(null);
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
    // 입력 중이던 툴바의 제목을, 선택이 바뀌어 입력칸이 사라지기 전에 먼저 반영한다.
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
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
    const textId =
      target.closest<HTMLElement>('[data-text-id]')?.dataset.textId;
    const widthHandle = target.closest('[data-text-width]');
    const controlHandle = target.closest('[data-control]');
    const shape = findElement(scene, 'shape', shapeId);
    const connector = findElement(scene, 'connector', connectorId);
    const text = findElement(scene, 'text', textId);
    const selectedText = findElement(scene, 'text', selectedId);

    if (corner && selectedId) {
      const selected = findElement(scene, 'shape', selectedId)!;
      const anchor = getCornerPoint(selected, getOppositeCorner(corner));
      setDrag({ ...base, kind: 'resize', id: selectedId, anchor });
    } else if (end && selectedId) {
      setDrag({ ...base, kind: 'line-end', id: selectedId, end });
    } else if (controlHandle && selectedId) {
      setDrag({ ...base, kind: 'line-control', id: selectedId });
    } else if (widthHandle && selectedText) {
      setDrag({
        ...base,
        kind: 'text-box-width',
        id: selectedText.id,
        x: selectedText.x,
      });
    } else if (tool === 'text') {
      setDrag({ ...base, kind: 'text-create', id: crypto.randomUUID() });
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
    } else if (text) {
      onSelect(text.id);
      setDrag({ ...base, kind: 'text-box-move', id: text.id, from: text });
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
      setDrag({
        ...base,
        kind: 'move',
        id: shape.id,
        from: shape,
        carried: [],
      });
    } else {
      onSelect(null);
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleDoubleClick(event: MouseEvent<SVGSVGElement>) {
    if (tool !== 'select') return;
    // 포인터 캡처 때문에 event.target이 svg가 되므로 실제 눌린 요소를 다시 찾는다.
    const pressed = document.elementFromPoint(event.clientX, event.clientY);
    const text = findElement(
      scene,
      'text',
      pressed?.closest<HTMLElement>('[data-text-id]')?.dataset.textId,
    );
    if (text) {
      onSelect(text.id);
      setEditingText(text);
      return;
    }
    const connectorId = pressed?.closest<SVGElement>('[data-connector-id]')
      ?.dataset.connectorId;
    if (connectorId) {
      onSelect(connectorId);
      setEditingLabelId(connectorId);
      return;
    }
    const id = pressed?.closest<SVGElement>('[data-shape-id]')?.dataset.shapeId;
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

  function commitLabel(id: string, label: string) {
    setEditingLabelId(null);
    const connector = findElement(scene, 'connector', id);
    if (!connector || connector.label === label) return;
    onChange(updateConnector(scene, id, { label }));
  }

  function finishText(text: TextElement, runs: TextRun[]) {
    setEditingText(null);
    const trimmed = trimTrailingNewlines(runs);
    const existing = findElement(scene, 'text', text.id);
    if (isRunsBlank(trimmed)) {
      if (existing) onChange(removeElement(scene, text.id));
      onSelect(null);
    } else if (!existing) {
      onChange({
        ...scene,
        elements: [...scene.elements, { ...text, runs: trimmed }],
      });
      onSelect(text.id);
    } else if (JSON.stringify(trimmed) !== JSON.stringify(existing.runs)) {
      onChange(updateText(scene, text.id, { runs: trimmed }));
    }
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    if (!drag) return;
    const point = getPoint(event);
    const moved =
      drag.moved ||
      Math.hypot(point.x - drag.start.x, point.y - drag.start.y) >
        DRAG_THRESHOLD;
    const next = { ...drag, point, moved, snap: !event.altKey };
    // 실제로 끌기 시작하는 순간의 장면으로 판단한다. 누르는 순간에는 방금 끝낸 입력이 아직 장면에 없다.
    if (next.kind === 'move' && moved && !drag.moved) {
      const box = findElement(scene, 'shape', next.id);
      next.carried = box ? getContainedElements(scene, box) : [];
    }
    setDrag(next);
  }

  function handlePointerUp(event: PointerEvent<SVGSVGElement>) {
    if (!drag) return;
    setDrag(null);
    const finished = { ...drag, snap: !event.altKey };
    if (finished.kind === 'text-create') {
      const { x, y } = finished.snap
        ? snapPoint(finished.start)
        : finished.start;
      setEditingText({ ...createText({ x, y }), id: finished.id });
      onToolDone();
      return;
    }
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
  const dragScenes = drag?.moved ? getDragScenes(scene, drag) : null;
  if (dragScenes) {
    displayScene = dragScenes.raw;
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

  // 입력하는 동안에는 입력칸만 보이게 한다.
  const editingLabel = findElement(scene, 'connector', editingLabelId);
  if (editingLabel) {
    displayScene = updateConnector(displayScene, editingLabel.id, {
      label: '',
    });
  }
  if (editingText) {
    displayScene = removeElement(displayScene, editingText.id);
  }

  const selectedShape = findElement(displayScene, 'shape', selectedId);
  const selectedConnector = findElement(displayScene, 'connector', selectedId);
  const selectedText = findElement(displayScene, 'text', selectedId);

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
      {selectedText && <TextSelection rect={getTextRect(selectedText)} />}
      {dragScenes?.guides.map((guide) => (
        <GuideLine key={guide.axis} guide={guide} />
      ))}
      {editingShape && (
        <ShapeTextEditor
          key={editingShape.id}
          shape={editingShape}
          onCommit={(content) => commitText(editingShape.id, content)}
          onCancel={() => setEditingId(null)}
        />
      )}
      {editingLabel && (
        <ConnectorLabelEditor
          key={editingLabel.id}
          connector={editingLabel}
          onCommit={(label) => commitLabel(editingLabel.id, label)}
          onCancel={() => setEditingLabelId(null)}
        />
      )}
      {editingText && (
        <TextEditor
          key={editingText.id}
          text={editingText}
          onFinish={(runs) => finishText(editingText, runs)}
        />
      )}
    </svg>
  );
}

const HANDLE_SIZE = 8;

function GuideLine({ guide }: { guide: Guide }) {
  const { axis, position, from, to } = guide;
  return axis === 'x' ? (
    <line
      className="design-guide"
      x1={position}
      x2={position}
      y1={from}
      y2={to}
    />
  ) : (
    <line
      className="design-guide"
      x1={from}
      x2={to}
      y1={position}
      y2={position}
    />
  );
}

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

function TextSelection({ rect }: { rect: Rect }) {
  return (
    <g>
      <rect
        className="design-selection"
        x={rect.x}
        y={rect.y}
        width={rect.w}
        height={rect.h}
      />
      <rect
        className="design-handle design-width-handle"
        data-text-width
        x={rect.x + rect.w - HANDLE_SIZE / 2}
        y={rect.y + rect.h / 2 - HANDLE_SIZE / 2}
        width={HANDLE_SIZE}
        height={HANDLE_SIZE}
        rx={2}
      />
    </g>
  );
}

function ConnectorSelection({ connector }: { connector: Connector }) {
  const control = getControlHandle(connector);
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
      {control && (
        <circle
          className="design-handle design-control-handle"
          data-control
          cx={control.x}
          cy={control.y}
          r={HANDLE_SIZE / 2 + 1}
        />
      )}
    </g>
  );
}
