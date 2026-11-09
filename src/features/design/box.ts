// 도형의 경로와 상단 테두리에 걸치는 제목의 자리를 계산한다.
import type { Shape } from './types';
import { getSquircleCornerLength, getSquirclePath } from './squircle';
import { measureTextWidth } from './measure';

export const TITLE_FONT_SIZE = 12;
export const TITLE_FONT_WEIGHT = 500;
// 글자와 끊긴 테두리 사이의 여백
const TITLE_PADDING = 4;
const RECT_TITLE_INSET = 12;

export interface BoxTitle {
  text: string;
  x: number;
  width: number;
}

function measureTitle(text: string): number {
  return measureTextWidth(text, TITLE_FONT_SIZE, TITLE_FONT_WEIGHT);
}

function fitTitle(title: string, maxWidth: number): string {
  if (measureTitle(title) <= maxWidth) return title;
  const chars = [...title];
  for (let count = chars.length - 1; count > 0; count--) {
    const text = `${chars.slice(0, count).join('').trimEnd()}…`;
    if (measureTitle(text) <= maxWidth) return text;
  }
  return '';
}

function getTitleInset({ type, w, h }: Shape): number {
  return type === 'rect' ? RECT_TITLE_INSET : getSquircleCornerLength(w, h);
}

// 윗변의 곧은 부분에 들어가도록 줄인 제목. 넣을 자리가 없으면 null.
export function getBoxTitle(shape: Shape): BoxTitle | null {
  if (!shape.title) return null;
  const inset = getTitleInset(shape);
  const text = fitTitle(shape.title, shape.w - 2 * inset - 2 * TITLE_PADDING);
  if (!text) return null;
  return {
    text,
    x: shape.x + inset + TITLE_PADDING,
    width: measureTitle(text),
  };
}

// 채우기와 누르기에 쓰는 닫힌 경로
export function getShapePath({ type, x, y, w, h }: Shape): string {
  if (type === 'rect') return `M ${x} ${y} h ${w} v ${h} h ${-w} Z`;
  return getSquirclePath(x, y, w, h);
}

// 테두리 경로. 제목이 있으면 그 구간을 실제로 비워 뒤의 요소를 가리지 않는다.
export function getShapeOutlinePath(
  shape: Shape,
  title: BoxTitle | null,
): string {
  if (!title) return getShapePath(shape);
  const { type, x, y, w, h } = shape;
  const gap = {
    from: title.x - TITLE_PADDING,
    to: title.x + title.width + TITLE_PADDING,
  };
  if (type === 'squircle') return getSquirclePath(x, y, w, h, gap);
  return `M ${gap.to} ${y} H ${x + w} V ${y + h} H ${x} V ${y} H ${gap.from}`;
}
