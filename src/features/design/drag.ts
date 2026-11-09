// 캔버스에서 끄는 동작 하나를 장면 변화로 바꾼다.
import type {
  Connector,
  Point,
  Scene,
  SceneElement,
  Shape,
  TextElement,
} from './types';
import {
  createConnector,
  createShape,
  updateConnector,
  updateShape,
  updateText,
} from './types';
import { MIN_TEXT_WIDTH } from './text';
import type { Alignment, AlignLines, Guide } from './guides';
import {
  NO_ALIGNMENT,
  alignDrag,
  getEdgeLines,
  getPointLines,
  getRectLines,
  getSceneLines,
} from './guides';
import type { Rect } from './geometry';
import {
  addPoint,
  clampTextOffset,
  getRectFromPoints,
  getTextRect,
  snapPoint,
  subtractPoint,
  translateElement,
} from './geometry';

// 클릭으로 도형을 만들 때의 크기
const DEFAULT_SHAPE_SIZE = { w: 160, h: 100 };

export type Drag = {
  start: Point;
  point: Point;
  // 조금이라도 끌었는지. 누르기만 했으면 false
  moved: boolean;
  // Alt를 누르고 있으면 격자에 붙이지 않는다.
  snap: boolean;
} & (
  | {
      kind: 'move';
      id: string;
      from: Rect;
      // 박스 안에 들어 있어 같이 옮기는 요소들의 끌기 시작 시점 모습
      carried: SceneElement[];
    }
  | { kind: 'resize'; id: string; anchor: Point }
  | { kind: 'create'; id: string; anchor: Point }
  | { kind: 'line-move'; id: string; from: Connector }
  | { kind: 'line-end'; id: string; end: 'from' | 'to' }
  | { kind: 'line-control'; id: string }
  | { kind: 'line-create'; id: string; anchor: Point }
  | { kind: 'text-move'; shape: Shape }
  | { kind: 'text-box-move'; id: string; from: TextElement }
  | { kind: 'text-box-width'; id: string; x: number }
  // 누르는 순간 입력칸을 열면 브라우저가 포커스를 뺏으므로 놓을 때 연다.
  | { kind: 'text-create'; id: string }
);

export interface DragScenes {
  // 포인터를 그대로 따라가는, 끄는 동안 보여 줄 장면
  raw: Scene;
  // 놓았을 때 격자나 안내선에 붙어 자리잡을 장면
  target: Scene;
  // 끄는 동안 보여 줄 정렬 안내선
  guides: Guide[];
}

export function getDragScenes(scene: Scene, drag: Drag): DragScenes {
  const snapIf = (point: Point) => (drag.snap ? snapPoint(point) : point);
  const delta = subtractPoint(drag.point, drag.start);
  // Alt는 격자와 안내선을 함께 끈다.
  const align = (
    getLines: (offset: Point) => AlignLines,
    excluded: string[],
  ): Alignment =>
    drag.snap && drag.moved
      ? alignDrag(getLines, getSceneLines(scene, excluded))
      : NO_ALIGNMENT;
  // 안내선에 걸린 축은 그대로 두고 나머지 축만 격자에 붙인다.
  const settle = (point: Point, { engaged }: Alignment): Point => {
    const snapped = snapIf(point);
    return {
      x: engaged.x ? point.x : snapped.x,
      y: engaged.y ? point.y : snapped.y,
    };
  };

  switch (drag.kind) {
    case 'move': {
      // 박스만 격자에 맞추고 안쪽은 같은 만큼 옮겨 상대 위치를 유지한다.
      const moveBy = (offset: Point) => {
        const moved = new Map(
          drag.carried.map((element) => [
            element.id,
            translateElement(element, offset),
          ]),
        );
        const next = updateShape(scene, drag.id, addPoint(drag.from, offset));
        return {
          ...next,
          elements: next.elements.map(
            (element) => moved.get(element.id) ?? element,
          ),
        };
      };
      const position = addPoint(drag.from, delta);
      const alignment = align(
        (offset) =>
          getRectLines({ ...drag.from, ...addPoint(position, offset) }),
        [drag.id, ...drag.carried.map(({ id }) => id)],
      );
      const aligned = addPoint(position, alignment.offset);
      return {
        raw: moveBy(subtractPoint(aligned, drag.from)),
        target: moveBy(subtractPoint(settle(aligned, alignment), drag.from)),
        guides: alignment.guides,
      };
    }
    case 'resize': {
      const alignment = align(
        (offset) => getEdgeLines(drag.anchor, addPoint(drag.point, offset)),
        [drag.id],
      );
      const point = addPoint(drag.point, alignment.offset);
      return {
        raw: updateShape(scene, drag.id, getRectFromPoints(drag.anchor, point)),
        target: updateShape(
          scene,
          drag.id,
          getRectFromPoints(drag.anchor, settle(point, alignment)),
        ),
        guides: alignment.guides,
      };
    }
    case 'create': {
      const addShape = (rect: Rect) => ({
        ...scene,
        elements: [...scene.elements, { ...createShape(rect), id: drag.id }],
      });
      // 끌지 않고 누르기만 했으면 그 자리에 기본 크기로 만든다.
      if (!drag.moved) {
        const shape = addShape({
          ...snapIf(drag.anchor),
          ...DEFAULT_SHAPE_SIZE,
        });
        return { raw: shape, target: shape, guides: [] };
      }
      const alignment = align(
        (offset) => getEdgeLines(drag.anchor, addPoint(drag.point, offset)),
        [],
      );
      const point = addPoint(drag.point, alignment.offset);
      return {
        raw: addShape(getRectFromPoints(drag.anchor, point)),
        target: addShape(
          getRectFromPoints(snapIf(drag.anchor), settle(point, alignment)),
        ),
        guides: alignment.guides,
      };
    }
    case 'line-move': {
      // 시작점을 격자에 붙이고 끝점은 같은 만큼 옮겨 길이를 유지한다.
      const moveBy = (offset: Point) =>
        updateConnector(
          scene,
          drag.id,
          translateElement(drag.from, offset) as Connector,
        );
      const alignment = align(
        (offset) =>
          getPointLines([
            addPoint(addPoint(drag.from.from, delta), offset),
            addPoint(addPoint(drag.from.to, delta), offset),
          ]),
        [drag.id],
      );
      const from = addPoint(addPoint(drag.from.from, delta), alignment.offset);
      return {
        raw: moveBy(addPoint(delta, alignment.offset)),
        target: moveBy(subtractPoint(settle(from, alignment), drag.from.from)),
        guides: alignment.guides,
      };
    }
    case 'line-control':
      return {
        raw: updateConnector(scene, drag.id, { control: drag.point }),
        target: updateConnector(scene, drag.id, {
          control: snapIf(drag.point),
        }),
        guides: [],
      };
    case 'text-move': {
      const { shape } = drag;
      const moved = addPoint({ x: shape.text.dx, y: shape.text.dy }, delta);
      const snapped = snapIf(moved);
      const withOffset = (x: number, y: number) =>
        updateShape(scene, shape.id, {
          text: { ...shape.text, ...clampTextOffset(shape, { dx: x, dy: y }) },
        });
      return {
        raw: withOffset(moved.x, moved.y),
        target: withOffset(snapped.x, snapped.y),
        guides: [],
      };
    }
    case 'text-box-move': {
      const position = addPoint(drag.from, delta);
      const rect = getTextRect(drag.from);
      const alignment = align(
        (offset) => getRectLines({ ...rect, ...addPoint(position, offset) }),
        [drag.id],
      );
      const raw = addPoint(position, alignment.offset);
      return {
        raw: updateText(scene, drag.id, raw),
        target: updateText(scene, drag.id, settle(raw, alignment)),
        guides: alignment.guides,
      };
    }
    case 'text-box-width': {
      const widthTo = ({ x }: Point) => Math.max(MIN_TEXT_WIDTH, x - drag.x);
      return {
        raw: updateText(scene, drag.id, { w: widthTo(drag.point) }),
        target: updateText(scene, drag.id, { w: widthTo(snapIf(drag.point)) }),
        guides: [],
      };
    }
    case 'text-create':
      return { raw: scene, target: scene, guides: [] };
    case 'line-end': {
      const alignment = align(
        (offset) => getPointLines([addPoint(drag.point, offset)]),
        [drag.id],
      );
      const point = addPoint(drag.point, alignment.offset);
      return {
        raw: updateConnector(scene, drag.id, { [drag.end]: point }),
        target: updateConnector(scene, drag.id, {
          [drag.end]: settle(point, alignment),
        }),
        guides: alignment.guides,
      };
    }
    case 'line-create': {
      const addConnector = (from: Point, to: Point) => ({
        ...scene,
        elements: [
          ...scene.elements,
          { ...createConnector(from, to), id: drag.id },
        ],
      });
      const alignment = align(
        (offset) => getPointLines([addPoint(drag.point, offset)]),
        [],
      );
      const point = addPoint(drag.point, alignment.offset);
      return {
        raw: addConnector(drag.anchor, point),
        target: addConnector(snapIf(drag.anchor), settle(point, alignment)),
        guides: alignment.guides,
      };
    }
  }
}
