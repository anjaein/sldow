import type { TextElement, TextRun } from './types';
import { DEFAULT_RUN_STYLE } from './text';
import { writeRuns } from './textDom';

// 장면의 글자는 미리보기와 편집 창에서 같게 보이도록 글꼴을 고정한다.
export const SCENE_FONT = 'ui-sans-serif, system-ui, sans-serif';

let context: CanvasRenderingContext2D | null = null;

export function measureTextWidth(
  text: string,
  fontSize: number,
  fontWeight = 400,
): number {
  context ??= document.createElement('canvas').getContext('2d');
  if (!context) return text.length * fontSize;
  context.font = `${fontWeight} ${fontSize}px ${SCENE_FONT}`;
  return context.measureText(text).width;
}

let probe: HTMLDivElement | null = null;
const heights = new WeakMap<TextRun[], { w: number; h: number }>();

// 줄바꿈 결과는 브라우저만 정확히 알기 때문에, 화면과 같은 스타일의 숨은 요소로 잰다.
export function measureTextHeight({
  w,
  runs,
}: Pick<TextElement, 'w' | 'runs'>): number {
  const cached = heights.get(runs);
  if (cached?.w === w) return cached.h;
  if (!probe) {
    probe = document.createElement('div');
    probe.className = 'design-text design-text-probe';
    probe.style.fontFamily = SCENE_FONT;
    document.body.append(probe);
  }
  probe.style.width = `${w}px`;
  writeRuns(probe, runs, DEFAULT_RUN_STYLE);
  const h = probe.offsetHeight;
  heights.set(runs, { w, h });
  return h;
}
