import type { Point, Scene } from './types';

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

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

function mixPoint(from: Point, to: Point, t: number): Point {
  return { x: mix(from.x, to.x, t), y: mix(from.y, to.y, t) };
}

// t가 0이면 from, 1이면 to. 스프링이 1을 넘어가면 살짝 지나쳤다 돌아온다.
// 두 장면은 같은 순서로 같은 요소를 가져야 하며, 바뀐 요소만 위치를 섞는다.
export function mixScene(from: Scene, to: Scene, t: number): Scene {
  if (
    from.shapes.length !== to.shapes.length ||
    from.connectors.length !== to.connectors.length
  ) {
    return to;
  }
  return {
    shapes: to.shapes.map((shape, index) => {
      const start = from.shapes[index];
      if (start === shape) return shape;
      return {
        ...shape,
        x: mix(start.x, shape.x, t),
        y: mix(start.y, shape.y, t),
        w: mix(start.w, shape.w, t),
        h: mix(start.h, shape.h, t),
        text: {
          ...shape.text,
          dx: mix(start.text.dx, shape.text.dx, t),
          dy: mix(start.text.dy, shape.text.dy, t),
        },
      };
    }),
    connectors: to.connectors.map((connector, index) => {
      const start = from.connectors[index];
      if (start === connector) return connector;
      return {
        ...connector,
        from: mixPoint(start.from, connector.from, t),
        to: mixPoint(start.to, connector.to, t),
      };
    }),
  };
}
