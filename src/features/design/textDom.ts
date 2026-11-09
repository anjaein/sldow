// 글자 조각과 contentEditable DOM 사이를 오간다. 입력은 브라우저에 맡기고(한글 조합 보호),
// 서식을 바꿀 때만 DOM을 읽어 조각을 고친 뒤 다시 쓴다.
import type { TextRun } from './types';
import type { RunStyle } from './text';
import {
  DEFAULT_RUN_STYLE,
  getRootFontSize,
  getRunStyle,
  getRunsLength,
  mergeRuns,
} from './text';

export function writeRuns(
  root: HTMLElement,
  runs: TextRun[],
  fallback: RunStyle,
): void {
  // 빈 입력칸에서 쓰기 시작하는 글자가 저장될 서식 그대로 보이게 한다.
  const caret = runs.length === 0 ? getRunStyle(fallback) : null;
  root.style.color = caret?.color ?? '';
  root.style.fontWeight = caret ? String(caret.fontWeight) : '';
  root.style.textDecorationLine = caret?.textDecorationLine ?? '';
  root.style.textDecorationColor = caret?.textDecorationColor ?? '';
  root.style.fontSize = `${getRootFontSize(runs, fallback)}px`;
  root.replaceChildren(
    ...runs.map(({ text, ...style }) => {
      const span = document.createElement('span');
      span.dataset.run = JSON.stringify(style);
      Object.assign(span.style, getRunStyle(style));
      span.textContent = text;
      return span;
    }),
  );
  // pre-wrap은 맨 끝의 줄바꿈을 그리지 않으므로 커서가 새 줄에 놓이게 br을 덧붙인다.
  if (runs.at(-1)?.text.endsWith('\n')) {
    root.append(document.createElement('br'));
  }
}

function readStyle(parent: Element | null, fallback: RunStyle): RunStyle {
  const value = parent?.closest<HTMLElement>('[data-run]')?.dataset.run;
  return value ? (JSON.parse(value) as RunStyle) : fallback;
}

export function readRuns(root: Node, fallback: RunStyle): TextRun[] {
  const runs: TextRun[] = [];
  let endsWithBreak = false;
  const visit = (node: Node) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.nodeValue ?? '';
        runs.push({ ...readStyle(child.parentElement, fallback), text });
        if (text) endsWithBreak = false;
      } else if (child.nodeName === 'BR') {
        runs.push({ ...fallback, text: '\n' });
        endsWithBreak = true;
      } else {
        visit(child);
      }
    });
  };
  visit(root);
  // 맨 끝의 br은 브라우저나 writeRuns가 자리만 잡으려고 넣은 것이다.
  if (endsWithBreak) runs.pop();
  return mergeRuns(runs);
}

export function getSelectionOffsets(
  root: HTMLElement,
): { start: number; end: number } | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (
    !root.contains(range.startContainer) ||
    !root.contains(range.endContainer)
  ) {
    return null;
  }
  const offsetOf = (node: Node, offset: number) => {
    const before = document.createRange();
    before.setStart(root, 0);
    before.setEnd(node, offset);
    return getRunsLength(readRuns(before.cloneContents(), DEFAULT_RUN_STYLE));
  };
  return {
    start: offsetOf(range.startContainer, range.startOffset),
    end: offsetOf(range.endContainer, range.endOffset),
  };
}

function locate(root: HTMLElement, offset: number): [Node, number] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let last: Text | null = null;
  while (walker.nextNode()) {
    last = walker.currentNode as Text;
    if (remaining <= last.length) return [last, remaining];
    remaining -= last.length;
  }
  return last ? [last, last.length] : [root, 0];
}

export function setSelectionOffsets(
  root: HTMLElement,
  start: number,
  end: number,
): void {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.setStart(...locate(root, start));
  range.setEnd(...locate(root, end));
  selection.removeAllRanges();
  selection.addRange(range);
}
