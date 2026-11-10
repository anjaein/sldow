// 탭 전환에서 코드 블록끼리 모핑하기. 두 패널의 코드 블록 수가 같으면 k번째끼리 짝짓는다.
// 짝이 맞지 않으면 코드 블록도 글 블록처럼 바로 바뀐다.
import type { CodeMorph, CodeSnapshot } from '../transition/codeMorph';
import { snapshotCode, startCodeMorph } from '../transition/codeMorph';

const CODE_SELECTOR = '[data-content-type="codeBlock"] > pre > code';

// 접힌 토글 안처럼 보이지 않는 코드 블록은 짝짓기에서 뺀다.
function visibleCodes(panel: Element): HTMLElement[] {
  return [...panel.querySelectorAll<HTMLElement>(CODE_SELECTOR)].filter(
    (code) => (code.parentElement?.getClientRects().length ?? 0) > 0,
  );
}

// <pre>가 가로로 스크롤되며 글자를 자르고, 블록 내용 요소가 어두운 바탕을 그린다.
const target = (code: HTMLElement) => ({
  text: code,
  clip: code.parentElement ?? undefined,
  box:
    code.closest<HTMLElement>('[data-content-type="codeBlock"]') ?? undefined,
});

// 전환 직전, 이전 패널이 보일 때 그 코드 블록들을 찍어 둔다. 하나라도 너무 길면 null이다.
export function snapshotPanelCode(
  panel: Element,
  container: HTMLElement,
): CodeSnapshot[] | null {
  const snapshots: CodeSnapshot[] = [];
  for (const code of visibleCodes(panel)) {
    const snapshot = snapshotCode(target(code), container);
    if (!snapshot) return null;
    snapshots.push(snapshot);
  }
  return snapshots;
}

// 새 패널이 그려진 뒤 부른다. 짝을 지을 수 없거나 코드가 너무 길면 null을 돌려주고,
// 호출한 쪽은 코드 블록을 글 블록처럼 다룬다.
export function morphPanelCode(
  before: readonly CodeSnapshot[],
  to: Element,
  container: HTMLElement,
  timing: { duration: number; easing: string },
): CodeMorph | null {
  const after = visibleCodes(to);
  if (before.length === 0 || before.length !== after.length) return null;
  return startCodeMorph(
    before.map((from, index) => ({ from, to: target(after[index]) })),
    { container, ...timing },
  );
}
