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

export type StrokeStyle = 'solid' | 'dashed' | 'dotted';

export interface Shape {
  id: string;
  kind: 'shape';
  type: 'squircle' | 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
  // null이면 흰 바탕
  fill: string | null;
  stroke: string;
  strokeStyle: StrokeStyle;
  // 상단 테두리에 걸치는 제목. 빈 문자열이면 없다.
  title: string;
  text: ShapeText;
}

export type ArrowHead = 'filled' | 'hollow';

// 선은 도형과 연결되지 않고 두 끝점만 가진다.
export interface Connector {
  id: string;
  kind: 'connector';
  path: 'straight' | 'curve' | 'elbow';
  dashed: boolean;
  arrowEnd: boolean;
  arrowHead: ArrowHead;
  color: string;
  strokeWidth: number;
  // 선 중간에 표시하는 글자. 빈 문자열이면 없다.
  label: string;
  from: Point;
  to: Point;
  // 곡선: 곡선이 지나는 점. 없으면 S자 곡선이다.
  // 꺾은선: 가운데 구간의 위치. 없으면 ㄱ자로 한 번만 꺾는다.
  control?: Point;
}

export interface TextRun {
  text: string;
  color: string;
  size: number;
  bold?: boolean;
  // 밑줄 색. 글자색과 다를 수 있다. 없으면 null.
  underline?: string | null;
}

export interface TextElement {
  id: string;
  kind: 'text';
  x: number;
  y: number;
  w: number;
  // 줄바꿈은 run.text 안의 \n이다.
  runs: TextRun[];
}

export type SceneElement = Shape | Connector | TextElement;

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

// 필기용 색. 글자·테두리·선에 쓴다.
export const INK_BLACK = '#111111';
export const INK = [INK_BLACK, '#e03131', '#1971c2', '#868e96'];

export const DEFAULT_TEXT_WIDTH = 200;
export const DEFAULT_STROKE_WIDTH = 1.5;
export const STROKE_WIDTHS = [
  { width: DEFAULT_STROKE_WIDTH, label: '얇게' },
  { width: 2.5, label: '보통' },
  { width: 4, label: '굵게' },
];

export function createShape(rect: Pick<Shape, 'x' | 'y' | 'w' | 'h'>): Shape {
  return {
    id: crypto.randomUUID(),
    kind: 'shape',
    type: 'squircle',
    ...rect,
    fill: null,
    stroke: INK_BLACK,
    strokeStyle: 'solid',
    title: '',
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
    arrowHead: 'filled',
    color: INK_BLACK,
    strokeWidth: DEFAULT_STROKE_WIDTH,
    label: '',
    from,
    to,
  };
}

export function createText(point: Point): TextElement {
  return {
    id: crypto.randomUUID(),
    kind: 'text',
    ...point,
    w: DEFAULT_TEXT_WIDTH,
    runs: [],
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

// 그리는 순서의 맨 앞(위) 또는 맨 뒤(아래)로 옮긴다. 이미 그 자리면 같은 장면을 돌려준다.
export function reorderElement(
  scene: Scene,
  id: string,
  edge: 'front' | 'back',
): Scene {
  const element = scene.elements.find((element) => element.id === id);
  const atEdge = edge === 'front' ? scene.elements.at(-1) : scene.elements[0];
  if (!element || element === atEdge) return scene;
  const rest = scene.elements.filter((other) => other !== element);
  return {
    ...scene,
    elements: edge === 'front' ? [...rest, element] : [element, ...rest],
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
  return kind === 'shape' || kind === 'connector' || kind === 'text';
}

// 나중에 추가한 속성이 없는 저장본에 기본값을 채운다.
function withDefaults(element: SceneElement): SceneElement {
  if (element.kind === 'text') {
    return {
      ...element,
      w: element.w ?? DEFAULT_TEXT_WIDTH,
      runs: Array.isArray(element.runs) ? element.runs : [],
    };
  }
  if (element.kind === 'connector') {
    return {
      ...element,
      arrowHead: element.arrowHead ?? 'filled',
      color: element.color ?? INK_BLACK,
      strokeWidth: element.strokeWidth ?? DEFAULT_STROKE_WIDTH,
      label: element.label ?? '',
    };
  }
  return {
    ...element,
    stroke: element.stroke ?? INK_BLACK,
    strokeStyle: element.strokeStyle ?? 'solid',
    title: element.title ?? '',
  };
}

// 저장된 문자열이 깨져 있어도 블록이 망가지지 않게 빈 장면으로 연다.
export function parseScene(value: string): Scene {
  try {
    const parsed = JSON.parse(value) as Partial<Scene> & LegacyScene;
    const elements = Array.isArray(parsed.elements)
      ? parsed.elements
      : fromLegacyScene(parsed);
    return {
      version: 2,
      elements: elements.filter(isSceneElement).map(withDefaults),
    };
  } catch {
    return EMPTY_SCENE;
  }
}

export function updateText(
  scene: Scene,
  id: string,
  patch: Partial<TextElement>,
): Scene {
  return {
    ...scene,
    elements: scene.elements.map((element) =>
      element.kind === 'text' && element.id === id
        ? { ...element, ...patch }
        : element,
    ),
  };
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
