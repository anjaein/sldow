import type { Connector } from './types';

export function getConnectorPath({ path, from, to }: Connector): string {
  if (path === 'straight') return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
  // 곡선은 더 많이 벌어진 방향으로 휘어 S자로 잇는다.
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const [c1, c2] =
    Math.abs(dx) >= Math.abs(dy)
      ? [`${from.x + dx / 2} ${from.y}`, `${to.x - dx / 2} ${to.y}`]
      : [`${from.x} ${from.y + dy / 2}`, `${to.x} ${to.y - dy / 2}`];
  return `M ${from.x} ${from.y} C ${c1} ${c2} ${to.x} ${to.y}`;
}
