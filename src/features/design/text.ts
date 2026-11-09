// 자유 텍스트의 글자 조각(run)을 다룬다. 위치는 run.text를 이어 붙인 문자열의 글자 번호다.
import type { TextRun } from './types';
import { INK_BLACK } from './types';

export const TEXT_SIZES = [11, 14, 18, 24];
export const MIN_TEXT_WIDTH = 40;
export const LINE_HEIGHT = 1.4;

export type RunStyle = Omit<TextRun, 'text'>;

export const DEFAULT_RUN_STYLE: RunStyle = { color: INK_BLACK, size: 14 };

export function getStyleOf({
  color,
  size,
  bold,
  underline,
}: RunStyle): RunStyle {
  return { color, size, bold, underline };
}

function isSameStyle(a: RunStyle, b: RunStyle): boolean {
  return (
    a.color === b.color &&
    a.size === b.size &&
    Boolean(a.bold) === Boolean(b.bold) &&
    (a.underline ?? null) === (b.underline ?? null)
  );
}

// 빈 조각을 없애고 서식이 같은 이웃을 합친다.
export function mergeRuns(runs: TextRun[]): TextRun[] {
  const merged: TextRun[] = [];
  for (const run of runs) {
    if (!run.text) continue;
    const last = merged.at(-1);
    if (last && isSameStyle(last, run)) {
      merged[merged.length - 1] = { ...last, text: last.text + run.text };
    } else {
      merged.push(run);
    }
  }
  return merged;
}

function splitAt(runs: TextRun[], offset: number): TextRun[] {
  let position = 0;
  return runs.flatMap((run) => {
    const start = position;
    position += run.text.length;
    if (offset <= start || offset >= position) return [run];
    const cut = offset - start;
    return [
      { ...run, text: run.text.slice(0, cut) },
      { ...run, text: run.text.slice(cut) },
    ];
  });
}

export function getRunsLength(runs: TextRun[]): number {
  return runs.reduce((length, run) => length + run.text.length, 0);
}

// offset 바로 앞 글자의 서식. 맨 앞이면 첫 글자, 글자가 없으면 fallback.
export function getStyleAt(
  runs: TextRun[],
  offset: number,
  fallback: RunStyle,
): RunStyle {
  let position = 0;
  for (const run of runs) {
    position += run.text.length;
    if (offset <= position) return getStyleOf(run);
  }
  const last = runs.at(-1);
  return last ? getStyleOf(last) : fallback;
}

export function formatRuns(
  runs: TextRun[],
  start: number,
  end: number,
  patch: Partial<RunStyle>,
): TextRun[] {
  let position = 0;
  return mergeRuns(
    splitAt(splitAt(runs, start), end).map((run) => {
      const inside = position >= start && position + run.text.length <= end;
      position += run.text.length;
      return inside ? { ...run, ...patch } : run;
    }),
  );
}

export function spliceRuns(
  runs: TextRun[],
  start: number,
  end: number,
  text: string,
  fallback: RunStyle,
): TextRun[] {
  const inserted = { ...getStyleAt(runs, start, fallback), text };
  const before: TextRun[] = [];
  const after: TextRun[] = [];
  let position = 0;
  for (const run of splitAt(splitAt(runs, start), end)) {
    if (position < start) before.push(run);
    else if (position >= end) after.push(run);
    position += run.text.length;
  }
  return mergeRuns([...before, inserted, ...after]);
}

export function isRunsBlank(runs: TextRun[]): boolean {
  return runs.every((run) => run.text.trim() === '');
}

// 끝의 빈 줄은 보이지 않으므로 저장하지 않는다.
export function trimTrailingNewlines(runs: TextRun[]): TextRun[] {
  const trimmed = [...runs];
  while (trimmed.length > 0) {
    const last = trimmed[trimmed.length - 1];
    const text = last.text.replace(/\n+$/, '');
    if (text) {
      trimmed[trimmed.length - 1] = { ...last, text };
      break;
    }
    trimmed.pop();
  }
  return trimmed;
}

// 줄의 최소 높이를 정하는 기준. 가장 작은 글자에 맞춰 작은 주석 줄이 벌어지지 않게 한다.
export function getRootFontSize(runs: TextRun[], fallback: RunStyle): number {
  return runs.length > 0
    ? Math.min(...runs.map((run) => run.size))
    : fallback.size;
}

export function getRunStyle(run: RunStyle) {
  return {
    color: run.color,
    fontSize: `${run.size}px`,
    fontWeight: run.bold ? 700 : 400,
    textDecorationLine: run.underline ? 'underline' : 'none',
    textDecorationColor: run.underline ?? 'currentcolor',
  };
}
