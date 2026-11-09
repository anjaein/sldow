// 모서리가 원호 대신 부드럽게 이어지는 스쿼클 경로를 만든다.
// Figma의 corner smoothing과 같은 방식: 원호 앞뒤에 베지어 곡선을 붙여 곡률이 서서히 바뀌게 한다.

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

const RADIUS = 20;
const SMOOTHING = 0.6;

// 한 모서리가 쓸 수 있는 길이는 짧은 변의 절반까지다.
const getBudget = (w: number, h: number) => Math.max(0, Math.min(w, h) / 2);

// 모서리 곡선이 변을 차지하는 길이. 이 안쪽만 곧은 변이다.
export function getSquircleCornerLength(w: number, h: number): number {
  const budget = getBudget(w, h);
  const r = Math.min(RADIUS, budget);
  if (r <= 0) return 0;
  return Math.min((1 + Math.min(SMOOTHING, budget / r - 1)) * r, budget);
}

// gap을 주면 윗변의 그 구간을 비운 열린 경로를 돌려준다. 윗변의 곧은 부분 안에 있어야 한다.
export function getSquirclePath(
  x: number,
  y: number,
  w: number,
  h: number,
  gap?: { from: number; to: number },
): string {
  const budget = getBudget(w, h);
  const r = Math.min(RADIUS, budget);
  if (r <= 0) return `M ${x} ${y} h ${w} v ${h} h ${-w} Z`;

  const s = Math.min(SMOOTHING, budget / r - 1);
  const p = getSquircleCornerLength(w, h);
  const arcMeasure = 90 * (1 - s);
  const arc = Math.sin(toRadians(arcMeasure / 2)) * r * Math.SQRT2;
  const angleAlpha = (90 - arcMeasure) / 2;
  const p3ToP4 = r * Math.tan(toRadians(angleAlpha / 2));
  const angleBeta = 45 * s;
  const c = p3ToP4 * Math.cos(toRadians(angleBeta));
  const d = c * Math.tan(toRadians(angleBeta));
  const b = (p - arc - c - d) / 3;
  const a = 2 * b;
  const abc = a + b + c;

  return [
    gap ? `M ${gap.to} ${y} L ${x + w - p} ${y}` : `M ${x + w - p} ${y}`,
    `c ${a} 0 ${a + b} 0 ${abc} ${d}`,
    `a ${r} ${r} 0 0 1 ${arc} ${arc}`,
    `c ${d} ${c} ${d} ${b + c} ${d} ${abc}`,
    `L ${x + w} ${y + h - p}`,
    `c 0 ${a} 0 ${a + b} ${-d} ${abc}`,
    `a ${r} ${r} 0 0 1 ${-arc} ${arc}`,
    `c ${-c} ${d} ${-(b + c)} ${d} ${-abc} ${d}`,
    `L ${x + p} ${y + h}`,
    `c ${-a} 0 ${-(a + b)} 0 ${-abc} ${-d}`,
    `a ${r} ${r} 0 0 1 ${-arc} ${-arc}`,
    `c ${-d} ${-c} ${-d} ${-(b + c)} ${-d} ${-abc}`,
    `L ${x} ${y + p}`,
    `c 0 ${-a} 0 ${-(a + b)} ${d} ${-abc}`,
    `a ${r} ${r} 0 0 1 ${arc} ${-arc}`,
    `c ${c} ${-d} ${b + c} ${-d} ${abc} ${-d}`,
    gap ? `L ${gap.from} ${y}` : 'Z',
  ].join(' ');
}
