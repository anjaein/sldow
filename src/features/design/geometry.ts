import type { Point, Scene, SceneElement, Shape, TextElement } from './types';
import { measureTextHeight } from './measure';
import { getConnectorExtent } from './connector';

export const GRID_SIZE = 20;
// 도형이 이보다 작아지지 않게 한다.
export const MIN_SHAPE_SIZE = GRID_SIZE;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Corner = 'nw' | 'ne' | 'sw' | 'se';
export const CORNERS: Corner[] = ['nw', 'ne', 'sw', 'se'];

const snap = (value: number) => Math.round(value / GRID_SIZE) * GRID_SIZE;

export function addPoint(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function subtractPoint(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function snapPoint({ x, y }: Point): Point {
  return { x: snap(x), y: snap(y) };
}

export function getCornerPoint(rect: Rect, corner: Corner): Point {
  return {
    x: corner.endsWith('w') ? rect.x : rect.x + rect.w,
    y: corner.startsWith('n') ? rect.y : rect.y + rect.h,
  };
}

export function getOppositeCorner(corner: Corner): Corner {
  const vertical = corner[0] === 'n' ? 's' : 'n';
  const horizontal = corner[1] === 'w' ? 'e' : 'w';
  return `${vertical}${horizontal}` as Corner;
}

// 고정된 꼭짓점(anchor)에서 끄는 점까지의 사각형. 너무 작으면 끄는 방향으로 최소 크기를 채운다.
export function getRectFromPoints(anchor: Point, point: Point): Rect {
  const w = Math.max(Math.abs(point.x - anchor.x), MIN_SHAPE_SIZE);
  const h = Math.max(Math.abs(point.y - anchor.y), MIN_SHAPE_SIZE);
  return {
    x: point.x < anchor.x ? anchor.x - w : anchor.x,
    y: point.y < anchor.y ? anchor.y - h : anchor.y,
    w,
    h,
  };
}

// 글자의 중심이 도형 안에 머물도록 옮긴 거리를 제한한다.
export function clampTextOffset(
  { w, h }: Pick<Rect, 'w' | 'h'>,
  { dx, dy }: { dx: number; dy: number },
): { dx: number; dy: number } {
  return {
    dx: Math.min(Math.max(dx, -w / 2), w / 2),
    dy: Math.min(Math.max(dy, -h / 2), h / 2),
  };
}

function isPointInside({ x, y }: Point, rect: Rect): boolean {
  return (
    x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h
  );
}

function isRectInside(inner: Rect, outer: Rect): boolean {
  return (
    isPointInside(inner, outer) &&
    isPointInside({ x: inner.x + inner.w, y: inner.y + inner.h }, outer)
  );
}

export function getTextRect(text: TextElement): Rect {
  return { x: text.x, y: text.y, w: text.w, h: measureTextHeight(text) };
}

// 장면에 들어 있는 모든 요소를 감싸는 사각형. 비어 있으면 null.
export function getSceneBounds(scene: Scene): Rect | null {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const element of scene.elements) {
    if (element.kind === 'connector') {
      for (const point of getConnectorExtent(element)) {
        xs.push(point.x);
        ys.push(point.y);
      }
    } else {
      const rect = element.kind === 'text' ? getTextRect(element) : element;
      xs.push(rect.x, rect.x + rect.w);
      ys.push(rect.y, rect.y + rect.h);
    }
  }
  if (xs.length === 0) return null;
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

// 박스를 옮길 때 같이 움직일, 박스 안에 완전히 들어 있는 요소들.
// 크기까지 같은 도형은 빼서, 같은 자리에 겹쳐 그린 두 도형을 떼어 놓을 수 있게 한다.
export function getContainedElements(scene: Scene, box: Shape): SceneElement[] {
  return scene.elements.filter((element) => {
    if (element.id === box.id) return false;
    if (element.kind === 'shape') {
      return (
        isRectInside(element, box) && element.w * element.h < box.w * box.h
      );
    }
    if (element.kind === 'text') return isRectInside(getTextRect(element), box);
    return isPointInside(element.from, box) && isPointInside(element.to, box);
  });
}

export function translateElement(
  element: SceneElement,
  offset: Point,
): SceneElement {
  if (element.kind !== 'connector') {
    return { ...element, ...addPoint(element, offset) };
  }
  return {
    ...element,
    from: addPoint(element.from, offset),
    to: addPoint(element.to, offset),
    control: element.control && addPoint(element.control, offset),
  };
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

function mixPoint(from: Point, to: Point, t: number): Point {
  return { x: mix(from.x, to.x, t), y: mix(from.y, to.y, t) };
}

function mixElement(
  start: SceneElement,
  element: SceneElement,
  t: number,
): SceneElement {
  if (start === element || start.id !== element.id) return element;
  if (start.kind === 'shape' && element.kind === 'shape') {
    return {
      ...element,
      x: mix(start.x, element.x, t),
      y: mix(start.y, element.y, t),
      w: mix(start.w, element.w, t),
      h: mix(start.h, element.h, t),
      text: {
        ...element.text,
        dx: mix(start.text.dx, element.text.dx, t),
        dy: mix(start.text.dy, element.text.dy, t),
      },
    };
  }
  if (start.kind === 'text' && element.kind === 'text') {
    return {
      ...element,
      x: mix(start.x, element.x, t),
      y: mix(start.y, element.y, t),
      w: mix(start.w, element.w, t),
    };
  }
  if (start.kind === 'connector' && element.kind === 'connector') {
    return {
      ...element,
      from: mixPoint(start.from, element.from, t),
      to: mixPoint(start.to, element.to, t),
      control:
        start.control && element.control
          ? mixPoint(start.control, element.control, t)
          : element.control,
    };
  }
  return element;
}

// t가 0이면 from, 1이면 to. 스프링이 1을 넘어가면 살짝 지나쳤다 돌아온다.
// 두 장면은 같은 순서로 같은 요소를 가져야 하며, 바뀐 요소만 위치를 섞는다.
export function mixScene(from: Scene, to: Scene, t: number): Scene {
  if (from.elements.length !== to.elements.length) return to;
  return {
    ...to,
    elements: to.elements.map((element, index) =>
      mixElement(from.elements[index], element, t),
    ),
  };
}
