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
