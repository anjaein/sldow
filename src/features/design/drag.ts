// 캔버스에서 끄는 동작 하나를 장면 변화로 바꾼다.
import type { Connector, Point, Scene, SceneElement, Shape } from './types';
import {
  createConnector,
  createShape,
  updateConnector,
  updateShape,
} from './types';
import type { Rect } from './geometry';
import {
  addPoint,
  clampTextOffset,
  getRectFromPoints,
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
  | { kind: 'line-create'; id: string; anchor: Point }
  | { kind: 'text-move'; shape: Shape }
);

export interface DragScenes {
  // 포인터를 그대로 따라가는, 끄는 동안 보여 줄 장면
  raw: Scene;
  // 놓았을 때 격자에 붙어 자리잡을 장면
  target: Scene;
}

export function getDragScenes(scene: Scene, drag: Drag): DragScenes {
  const snapIf = (point: Point) => (drag.snap ? snapPoint(point) : point);
  const delta = subtractPoint(drag.point, drag.start);

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
      const snapped = snapIf(addPoint(drag.from, delta));
      return {
        raw: moveBy(delta),
        target: moveBy(subtractPoint(snapped, drag.from)),
      };
    }
    case 'resize':
      return {
        raw: updateShape(
          scene,
          drag.id,
          getRectFromPoints(drag.anchor, drag.point),
        ),
        target: updateShape(
          scene,
          drag.id,
          getRectFromPoints(drag.anchor, snapIf(drag.point)),
        ),
      };
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
        return { raw: shape, target: shape };
      }
      return {
        raw: addShape(getRectFromPoints(drag.anchor, drag.point)),
        target: addShape(
          getRectFromPoints(snapIf(drag.anchor), snapIf(drag.point)),
        ),
      };
    }
    case 'line-move': {
      // 시작점을 격자에 붙이고 끝점은 같은 만큼 옮겨 길이를 유지한다.
      const from = addPoint(drag.from.from, delta);
      const to = addPoint(drag.from.to, delta);
      const correction = subtractPoint(snapIf(from), from);
      return {
        raw: updateConnector(scene, drag.id, { from, to }),
        target: updateConnector(scene, drag.id, {
          from: addPoint(from, correction),
          to: addPoint(to, correction),
        }),
      };
    }
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
      };
    }
    case 'line-end':
      return {
        raw: updateConnector(scene, drag.id, { [drag.end]: drag.point }),
        target: updateConnector(scene, drag.id, {
          [drag.end]: snapIf(drag.point),
        }),
      };
    case 'line-create': {
      const addConnector = (from: Point, to: Point) => ({
        ...scene,
        elements: [
          ...scene.elements,
          { ...createConnector(from, to), id: drag.id },
        ],
      });
      return {
        raw: addConnector(drag.anchor, drag.point),
        target: addConnector(snapIf(drag.anchor), snapIf(drag.point)),
      };
    }
  }
}
