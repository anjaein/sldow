// 디자인 블록의 장면(scene) 데이터. 블록의 props.scene에 JSON 문자열로 저장한다.

export interface Point {
  x: number;
  y: number;
}

export interface ShapeText {
  content: string;
  // 도형 가운데를 기준으로 옮긴 거리
  dx: number;
  dy: number;
}

export interface Shape {
  id: string;
  type: 'squircle';
  x: number;
  y: number;
  w: number;
  h: number;
  // null이면 흰 바탕
  fill: string | null;
  text: ShapeText;
}

// 선은 도형과 연결되지 않고 두 끝점만 가진다.
export interface Connector {
  id: string;
  path: 'straight' | 'curve';
  dashed: boolean;
  arrowEnd: boolean;
  from: Point;
  to: Point;
}

export interface Scene {
  shapes: Shape[];
  connectors: Connector[];
}

export const EMPTY_SCENE: Scene = { shapes: [], connectors: [] };

// 도형에 칠할 수 있는 색. 검은 선과 글자가 잘 보이도록 옅은 색만 쓴다.
export const PALETTE = [
  '#ffe3e3',
  '#ffe8cc',
  '#fff3bf',
  '#d3f9d8',
  '#c5f6fa',
  '#d0ebff',
  '#e5dbff',
  '#fcc2d7',
  '#e9ecef',
];

export function createShape(rect: Pick<Shape, 'x' | 'y' | 'w' | 'h'>): Shape {
  return {
    id: crypto.randomUUID(),
    type: 'squircle',
    ...rect,
    fill: null,
    text: { content: '', dx: 0, dy: 0 },
  };
}

export function createConnector(from: Point, to: Point): Connector {
  return {
    id: crypto.randomUUID(),
    path: 'straight',
    dashed: false,
    arrowEnd: true,
    from,
    to,
  };
}

export function removeElement(scene: Scene, id: string): Scene {
  return {
    shapes: scene.shapes.filter((shape) => shape.id !== id),
    connectors: scene.connectors.filter((connector) => connector.id !== id),
  };
}

export function updateShape(
  scene: Scene,
  id: string,
  patch: Partial<Shape>,
): Scene {
  return {
    ...scene,
    shapes: scene.shapes.map((shape) =>
      shape.id === id ? { ...shape, ...patch } : shape,
    ),
  };
}

export function serializeScene(scene: Scene): string {
  return JSON.stringify(scene);
}

// 저장된 문자열이 깨져 있어도 블록이 망가지지 않게 빈 장면으로 연다.
export function parseScene(value: string): Scene {
  try {
    const parsed = JSON.parse(value) as Partial<Scene>;
    return {
      shapes: Array.isArray(parsed.shapes) ? parsed.shapes : [],
      connectors: Array.isArray(parsed.connectors) ? parsed.connectors : [],
    };
  } catch {
    return EMPTY_SCENE;
  }
}

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

// 장면에 들어 있는 모든 도형과 선을 감싸는 사각형. 비어 있으면 null.
export function getSceneBounds(scene: Scene): Bounds | null {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const shape of scene.shapes) {
    xs.push(shape.x, shape.x + shape.w);
    ys.push(shape.y, shape.y + shape.h);
  }
  for (const connector of scene.connectors) {
    xs.push(connector.from.x, connector.to.x);
    ys.push(connector.from.y, connector.to.y);
  }
  if (xs.length === 0) return null;
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

export function updateConnector(
  scene: Scene,
  id: string,
  patch: Partial<Connector>,
): Scene {
  return {
    ...scene,
    connectors: scene.connectors.map((connector) =>
      connector.id === id ? { ...connector, ...patch } : connector,
    ),
  };
}
