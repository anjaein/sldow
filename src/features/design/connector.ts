import type { Connector, Point } from './types';
import { measureTextWidth } from './measure';

export const LABEL_FONT_SIZE = 12;
export const LABEL_FONT_WEIGHT = 500;
const LABEL_HEIGHT = 16;
// 라벨과 선 사이의 여백
const LABEL_OFFSET = 4;
// 곡선의 경계를 잡을 때 나누는 수
const CURVE_SAMPLES = 16;

const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const scale = (a: Point, k: number): Point => ({ x: a.x * k, y: a.y * k });
const middle = (a: Point, b: Point): Point => scale(add(a, b), 0.5);
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

function normalize(vector: Point): Point {
  const length = Math.hypot(vector.x, vector.y);
  return length === 0 ? { x: 1, y: 0 } : scale(vector, 1 / length);
}

const inRange = (value: number, a: number, b: number) =>
  value >= Math.min(a, b) && value <= Math.max(a, b);

// 꺾은선이 지나는 점들. control이 끝점 범위의 위아래로 벗어나면 가로 구간을 옮기고,
// 아니면 세로 구간을 옮긴다. 그래서 핸들 하나로 ㄱ자와 양쪽 방향의 ㄷ자를 모두 만든다.
export function getElbowPoints({ from, to, control }: Connector): Point[] {
  let points: Point[];
  if (!control) {
    points = [from, { x: to.x, y: from.y }, to];
  } else if (
    inRange(control.x, from.x, to.x) &&
    !inRange(control.y, from.y, to.y)
  ) {
    points = [from, { x: from.x, y: control.y }, { x: to.x, y: control.y }, to];
  } else {
    points = [from, { x: control.x, y: from.y }, { x: control.x, y: to.y }, to];
  }
  return points.filter(
    (point, index) =>
      index === 0 ||
      point.x !== points[index - 1].x ||
      point.y !== points[index - 1].y,
  );
}

// S자 곡선은 더 많이 벌어진 방향으로 휜다.
function getCubicControls({ from, to }: Connector): [Point, Point] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return Math.abs(dx) >= Math.abs(dy)
    ? [
        { x: from.x + dx / 2, y: from.y },
        { x: to.x - dx / 2, y: to.y },
      ]
    : [
        { x: from.x, y: from.y + dy / 2 },
        { x: to.x, y: to.y - dy / 2 },
      ];
}

// control은 곡선이 지나는 점이라 핸들이 선 위에 놓인다. 2차 베지어의 조절점은 여기서 되짚는다.
function getQuadraticControl({ from, to, control }: Connector): Point {
  return sub(scale(control!, 2), middle(from, to));
}

function getEndDirection(connector: Connector): Point {
  const { path, from, to, control } = connector;
  if (path === 'elbow') {
    const points = getElbowPoints(connector);
    return normalize(sub(to, points.at(-2) ?? from));
  }
  if (path === 'straight') return normalize(sub(to, from));
  return normalize(
    sub(
      to,
      control ? getQuadraticControl(connector) : getCubicControls(connector)[1],
    ),
  );
}

// trimEnd만큼 끝을 줄인 경로. 화살촉이 있으면 선이 촉을 뚫고 나오지 않게 줄인다.
export function getConnectorPath(connector: Connector, trimEnd = 0): string {
  const { path, from, to, control } = connector;
  const direction = getEndDirection(connector);
  const start =
    path === 'elbow' ? (getElbowPoints(connector).at(-2) ?? from) : from;
  const end = sub(to, scale(direction, Math.min(trimEnd, distance(start, to))));

  if (path === 'straight') return `M ${from.x} ${from.y} L ${end.x} ${end.y}`;
  if (path === 'elbow') {
    const points = getElbowPoints(connector).slice(0, -1);
    const lines = [...points, end].map(({ x, y }) => `${x} ${y}`);
    return `M ${lines.join(' L ')}`;
  }
  if (control) {
    const q = getQuadraticControl(connector);
    return `M ${from.x} ${from.y} Q ${q.x} ${q.y} ${end.x} ${end.y}`;
  }
  const [c1, c2] = getCubicControls(connector);
  return `M ${from.x} ${from.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${end.x} ${end.y}`;
}

const getArrowSize = (strokeWidth: number) => 8 + (strokeWidth - 1.5) * 2.4;

// 색·크기가 선을 따르도록 marker 대신 직접 그린다. trim은 선을 줄일 길이다.
export function getArrowHead(connector: Connector): {
  d: string;
  trim: number;
} {
  const size = getArrowSize(connector.strokeWidth);
  const direction = getEndDirection(connector);
  const normal = { x: -direction.y, y: direction.x };
  const tip = add(connector.to, scale(direction, size / 10));
  const base = sub(tip, scale(direction, size));
  const left = add(base, scale(normal, size / 2));
  const right = sub(base, scale(normal, size / 2));
  return {
    d: `M ${tip.x} ${tip.y} L ${left.x} ${left.y} L ${right.x} ${right.y} Z`,
    // 속이 빈 촉 안으로 선이 들어가지 않게 밑변까지 줄인다.
    trim: connector.arrowHead === 'hollow' ? size * 0.9 : size * 0.5,
  };
}

// 라벨을 놓을 선의 가운데 점과 그 자리의 진행 방향
function getConnectorMiddle(connector: Connector): {
  point: Point;
  direction: Point;
} {
  const { path, from, to, control } = connector;
  if (path === 'elbow') {
    // 꺾이는 점에 걸리지 않게 가장 긴 구간의 가운데를 쓴다.
    const points = getElbowPoints(connector);
    let longest: [Point, Point] = [from, to];
    let longestLength = -1;
    points.slice(1).forEach((point, index) => {
      const length = distance(points[index], point);
      if (length > longestLength) {
        longestLength = length;
        longest = [points[index], point];
      }
    });
    return {
      point: middle(longest[0], longest[1]),
      direction: normalize(sub(longest[1], longest[0])),
    };
  }
  if (path === 'curve' && control) {
    return { point: control, direction: normalize(sub(to, from)) };
  }
  if (path === 'curve') {
    const [c1, c2] = getCubicControls(connector);
    return {
      point: middle(from, to),
      direction: normalize(sub(add(c2, to), add(c1, from))),
    };
  }
  return { point: middle(from, to), direction: normalize(sub(to, from)) };
}

export interface ConnectorLabel {
  text: string;
  // 글자의 가운데
  x: number;
  y: number;
  width: number;
  height: number;
}

// 선을 가리지 않도록 진행 방향의 수직으로 비켜 놓는다. 위쪽, 세로선이면 오른쪽이 기본이다.
export function getLabelLayout(
  connector: Connector,
  text: string,
): ConnectorLabel {
  const width = measureTextWidth(text, LABEL_FONT_SIZE, LABEL_FONT_WEIGHT);
  const { point, direction } = getConnectorMiddle(connector);
  let normal = { x: -direction.y, y: direction.x };
  if (normal.y > 0 || (normal.y === 0 && normal.x < 0)) {
    normal = scale(normal, -1);
  }
  const clearance =
    Math.abs(normal.x) * (width / 2) +
    Math.abs(normal.y) * (LABEL_HEIGHT / 2) +
    connector.strokeWidth / 2 +
    LABEL_OFFSET;
  const { x, y } = add(point, scale(normal, clearance));
  return { text, x, y, width, height: LABEL_HEIGHT };
}

export function getConnectorLabel(connector: Connector): ConnectorLabel | null {
  return connector.label ? getLabelLayout(connector, connector.label) : null;
}

// 휨 핸들의 위치. 곡선과 꺾은선에만 있다.
export function getControlHandle(connector: Connector): Point | null {
  const { path, from, to, control } = connector;
  if (path === 'curve') return control ?? middle(from, to);
  if (path !== 'elbow') return null;
  const points = getElbowPoints(connector);
  const half = Math.floor(points.length / 2);
  return points.length % 2 === 0
    ? middle(points[half - 1], points[half])
    : points[half];
}

function sampleCurve(connector: Connector): Point[] {
  const { from, to, control } = connector;
  const at = (t: number): Point => {
    const s = 1 - t;
    if (control) {
      return add(
        add(
          scale(from, s * s),
          scale(getQuadraticControl(connector), 2 * s * t),
        ),
        scale(to, t * t),
      );
    }
    const [c1, c2] = getCubicControls(connector);
    return add(
      add(scale(from, s * s * s), scale(c1, 3 * s * s * t)),
      add(scale(c2, 3 * s * t * t), scale(to, t * t * t)),
    );
  };
  return Array.from({ length: CURVE_SAMPLES + 1 }, (_, index) =>
    at(index / CURVE_SAMPLES),
  );
}

// 미리보기 경계에 넣을 점들. 곡선이 끝점 밖으로 휘거나 라벨이 튀어나와도 잘리지 않게 한다.
export function getConnectorExtent(connector: Connector): Point[] {
  const { path, from, to } = connector;
  const points =
    path === 'curve'
      ? sampleCurve(connector)
      : path === 'elbow'
        ? getElbowPoints(connector)
        : [from, to];
  const label = getConnectorLabel(connector);
  if (!label) return points;
  return [
    ...points,
    { x: label.x - label.width / 2, y: label.y - label.height / 2 },
    { x: label.x + label.width / 2, y: label.y + label.height / 2 },
  ];
}
