// 끄는 요소가 다른 요소와 줄을 맞추는 순간을 찾아 안내선과 붙일 거리를 계산한다.
// 안내선은 화면 표시용이라 장면에 저장하지 않는다.
import type { Point, Scene, SceneElement } from './types';
import type { Rect } from './geometry';
import { getTextRect } from './geometry';

// 이 거리 안에 들어오면 붙는다. 캔버스는 확대가 없어 화면 픽셀과 같다.
const THRESHOLD = 6;
// 계산 오차를 감안해 같은 좌표로 보는 차이
const SAME_POSITION = 0.01;

export interface Guide {
  // 'x'면 x가 position인 세로선, 'y'면 y가 position인 가로선이다.
  axis: 'x' | 'y';
  position: number;
  from: number;
  to: number;
}

// 정렬 기준선 하나. value는 해당 축의 좌표, from·to는 다른 축으로 뻗은 범위다.
interface AlignLine {
  value: number;
  from: number;
  to: number;
}

export interface AlignLines {
  x: AlignLine[];
  y: AlignLine[];
}

export interface Alignment {
  offset: Point;
  // 안내선에 걸린 축. 이 축은 격자보다 안내선이 우선한다.
  engaged: { x: boolean; y: boolean };
  guides: Guide[];
}

export const NO_ALIGNMENT: Alignment = {
  offset: { x: 0, y: 0 },
  engaged: { x: false, y: false },
  guides: [],
};

export function getRectLines({ x, y, w, h }: Rect): AlignLines {
  return {
    x: [x, x + w / 2, x + w].map((value) => ({ value, from: y, to: y + h })),
    y: [y, y + h / 2, y + h].map((value) => ({ value, from: x, to: x + w })),
  };
}

export function getPointLines(points: Point[]): AlignLines {
  return {
    x: points.map(({ x, y }) => ({ value: x, from: y, to: y })),
    y: points.map(({ x, y }) => ({ value: y, from: x, to: x })),
  };
}

// 크기를 바꿀 때 움직이는 두 변. 끄는 모서리만 기준으로 삼는다.
export function getEdgeLines(anchor: Point, point: Point): AlignLines {
  return {
    x: [{ value: point.x, from: anchor.y, to: point.y }],
    y: [{ value: point.y, from: anchor.x, to: point.x }],
  };
}

function getElementLines(element: SceneElement): AlignLines {
  if (element.kind === 'connector') {
    return getPointLines([element.from, element.to]);
  }
  return getRectLines(element.kind === 'text' ? getTextRect(element) : element);
}

// 끌고 있지 않은 요소들의 기준선
export function getSceneLines(scene: Scene, excluded: string[]): AlignLines {
  const lines = scene.elements
    .filter(({ id }) => !excluded.includes(id))
    .map(getElementLines);
  return {
    x: lines.flatMap(({ x }) => x),
    y: lines.flatMap(({ y }) => y),
  };
}

function findNearest(dragged: AlignLine[], targets: AlignLine[]) {
  let nearest: { offset: number; position: number } | null = null;
  for (const line of dragged) {
    for (const target of targets) {
      const offset = target.value - line.value;
      if (
        Math.abs(offset) <= THRESHOLD &&
        (!nearest || Math.abs(offset) < Math.abs(nearest.offset))
      ) {
        nearest = { offset, position: target.value };
      }
    }
  }
  return nearest;
}

// 같은 좌표에 놓인 모든 기준선을 잇는 안내선 하나를 만든다.
function buildGuide(
  axis: Guide['axis'],
  position: number,
  lines: AlignLine[],
): Guide {
  const ends = lines
    .filter(({ value }) => Math.abs(value - position) < SAME_POSITION)
    .flatMap(({ from, to }) => [from, to]);
  return { axis, position, from: Math.min(...ends), to: Math.max(...ends) };
}

// x축과 y축을 따로 판단한다. 안내선은 한 축을 맞춘 뒤의 위치로 그려야 끄는 점까지 닿으므로,
// 기준선은 붙일 거리를 받아 만드는 함수로 받는다.
export function alignDrag(
  getLines: (offset: Point) => AlignLines,
  targets: AlignLines,
): Alignment {
  const unaligned = getLines({ x: 0, y: 0 });
  const x = findNearest(unaligned.x, targets.x);
  const y = findNearest(unaligned.y, targets.y);
  const offset = { x: x?.offset ?? 0, y: y?.offset ?? 0 };
  const aligned = getLines(offset);
  const guides: Guide[] = [];
  if (x) guides.push(buildGuide('x', x.position, [...aligned.x, ...targets.x]));
  if (y) guides.push(buildGuide('y', y.position, [...aligned.y, ...targets.y]));
  return { offset, engaged: { x: Boolean(x), y: Boolean(y) }, guides };
}
