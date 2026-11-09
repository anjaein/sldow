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
  kind: 'shape';
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
  kind: 'connector';
  path: 'straight' | 'curve';
  dashed: boolean;
  arrowEnd: boolean;
  from: Point;
  to: Point;
}

export type SceneElement = Shape | Connector;

export interface Scene {
  version: 2;
  // 배열 순서가 그리는 순서다. 뒤에 있을수록 위에 그린다.
  elements: SceneElement[];
}

export const EMPTY_SCENE: Scene = { version: 2, elements: [] };

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
    kind: 'shape',
    type: 'squircle',
    ...rect,
    fill: null,
    text: { content: '', dx: 0, dy: 0 },
  };
}

export function createConnector(from: Point, to: Point): Connector {
  return {
    id: crypto.randomUUID(),
    kind: 'connector',
    path: 'straight',
    dashed: false,
    arrowEnd: true,
    from,
    to,
  };
}

export function findElement<K extends SceneElement['kind']>(
  scene: Scene,
  kind: K,
  id: string | null | undefined,
) {
  return scene.elements.find(
    (element): element is Extract<SceneElement, { kind: K }> =>
      element.kind === kind && element.id === id,
  );
}

export function removeElement(scene: Scene, id: string): Scene {
  return {
    ...scene,
    elements: scene.elements.filter((element) => element.id !== id),
  };
}

export function updateShape(
  scene: Scene,
  id: string,
  patch: Partial<Shape>,
): Scene {
  return {
    ...scene,
    elements: scene.elements.map((element) =>
      element.kind === 'shape' && element.id === id
        ? { ...element, ...patch }
        : element,
    ),
  };
}

export function serializeScene(scene: Scene): string {
  return JSON.stringify(scene);
}

// version이 없던 옛 형식. 선을 항상 도형 위에 그렸다.
interface LegacyScene {
  shapes?: unknown;
  connectors?: unknown;
}

// 도형 다음에 선을 놓아 옛 문서가 같은 겹침 순서로 보이게 한다.
function fromLegacyScene({ shapes, connectors }: LegacyScene): SceneElement[] {
  const tag = (items: unknown, kind: SceneElement['kind']) =>
    Array.isArray(items)
      ? items.map((item) => ({ ...item, kind }) as SceneElement)
      : [];
  return [...tag(shapes, 'shape'), ...tag(connectors, 'connector')];
}

function isSceneElement(value: unknown): value is SceneElement {
  if (typeof value !== 'object' || value === null) return false;
  const { kind } = value as Partial<SceneElement>;
  return kind === 'shape' || kind === 'connector';
}

// 저장된 문자열이 깨져 있어도 블록이 망가지지 않게 빈 장면으로 연다.
export function parseScene(value: string): Scene {
  try {
    const parsed = JSON.parse(value) as Partial<Scene> & LegacyScene;
    const elements = Array.isArray(parsed.elements)
      ? parsed.elements
      : fromLegacyScene(parsed);
    return { version: 2, elements: elements.filter(isSceneElement) };
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
  for (const element of scene.elements) {
    if (element.kind === 'shape') {
      xs.push(element.x, element.x + element.w);
      ys.push(element.y, element.y + element.h);
    } else {
      xs.push(element.from.x, element.to.x);
      ys.push(element.from.y, element.to.y);
    }
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
    elements: scene.elements.map((element) =>
      element.kind === 'connector' && element.id === id
        ? { ...element, ...patch }
        : element,
    ),
  };
}
