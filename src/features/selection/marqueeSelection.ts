// 노션식 끌어 고르기. 블록 바깥 빈 곳에서 마우스를 눌러 끌면 사각형이 그려지고,
// 사각형에 걸친 블록들이 블록 선택이 된다. 끄는 동안 선택이 바로 바뀌고, 화면 위아래 끝에 가면 저절로 스크롤한다.
import type { Node as PMNode } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';
import type { BlockRange } from './blockSelection';

// 이만큼 움직이기 전에는 그냥 클릭으로 본다.
const DRAG_THRESHOLD = 4;
// 화면 끝에서 이 거리 안에 들어오면 스크롤한다. 끝에 가까울수록 빠르다.
const SCROLL_EDGE = 48;
const SCROLL_MAX_SPEED = 20;

// 블록 바깥의 빈 곳인가: 편집기를 감싼 요소(좌우 여백, 마지막 블록 아래)이거나,
// 편집기 안에서 블록 내용이 아닌 틀(블록 사이 틈, 자식 들여쓰기, 탭 블록의 테두리 안쪽 여백).
// 블록 내용(글, 탭 막대와 크기 손잡이, 디자인·그림 블록)과 손잡이·메뉴는 여기에 들지 않는다.
export function isEmptySpace(view: EditorView, target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  if (target === view.dom) return true;
  if (view.dom.contains(target)) {
    return target.matches('.bn-block-group, .bn-block-outer, .bn-block');
  }
  return target.contains(view.dom);
}

const intersects = (a: DOMRect, b: DOMRect) =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

// 블록 전체(자식 포함) 상자와 블록 자기 줄의 상자. 숨은 탭 패널 안의 블록은 상자가 없다.
function blockBoxes(view: EditorView, pos: number) {
  const dom = view.nodeDOM(pos);
  if (!(dom instanceof HTMLElement)) return null;
  const whole = dom.getBoundingClientRect();
  if (whole.width === 0 && whole.height === 0) return null;
  const own = dom.firstElementChild?.firstElementChild ?? dom;
  return { whole, own: own.getBoundingClientRect() };
}

// 사각형에 걸친 블록들. 블록 선택은 한 묶음 안의 이어진 블록들이므로, 가장 바깥 묶음부터 본다.
// - 두 블록 이상 걸치면 그 묶음에서 첫 블록부터 끝 블록까지 고른다.
// - 한 블록만 걸쳤는데 그 블록 자기 줄은 닿지 않고 자식만 닿으면 자식 묶음으로 내려간다.
//   탭 블록은 탭 막대가 자기 줄이고, 패널은 고를 수 없어 늘 보이는 패널의 내용으로 내려간다.
export function blockRangeInRect(
  view: EditorView,
  rect: DOMRect,
): BlockRange | null {
  let group: PMNode = view.state.doc.firstChild!;
  let groupStart = 1;
  for (;;) {
    const hits: { pos: number; node: PMNode; ownHit: boolean }[] = [];
    let pos = groupStart;
    group.forEach((block) => {
      const boxes = blockBoxes(view, pos);
      if (boxes && intersects(boxes.whole, rect)) {
        hits.push({ pos, node: block, ownHit: intersects(boxes.own, rect) });
      }
      pos += block.nodeSize;
    });
    if (hits.length === 0) return null;

    const first = hits[0];
    const last = hits[hits.length - 1];
    const isPanel = first.node.firstChild?.type.name === 'tabPanel';
    if (hits.length > 1 && !isPanel) {
      return { from: first.pos, to: last.pos + last.node.nodeSize };
    }
    const hasChildren = first.node.childCount === 2;
    if (!isPanel && (first.ownHit || !hasChildren)) {
      return { from: first.pos, to: first.pos + first.node.nodeSize };
    }
    if (!hasChildren) return null;
    // 블록 안(+1), 자기 내용 건너뜀, 자식 묶음 안(+1)
    groupStart = first.pos + 1 + first.node.firstChild!.nodeSize + 1;
    group = first.node.lastChild!;
  }
}

function scrollContainer(from: Element): HTMLElement | null {
  for (let el = from.parentElement; el; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el);
    if (
      (overflowY === 'auto' || overflowY === 'scroll') &&
      el.scrollHeight > el.clientHeight
    ) {
      return el;
    }
  }
  return null;
}

interface MarqueeHandlers {
  // 끄는 동안 사각형에 걸친 블록들(없으면 null)
  select: (range: BlockRange | null) => void;
  // 끌지 않고 뗀 경우
  click: (event: MouseEvent) => void;
  // 끌어 고르기를 마친 경우
  finish: () => void;
}

export function trackMarquee(
  view: EditorView,
  start: MouseEvent,
  handlers: MarqueeHandlers,
) {
  const container = scrollContainer(view.dom);
  const scrollTop = () => (container ? container.scrollTop : window.scrollY);
  const scrollLeft = () => (container ? container.scrollLeft : window.scrollX);
  // 시작점은 스크롤과 함께 움직여야 하므로 문서 기준으로 기억한다.
  const origin = {
    x: start.clientX + scrollLeft(),
    y: start.clientY + scrollTop(),
  };
  let pointer = { x: start.clientX, y: start.clientY };
  let dragging = false;
  let overlay: HTMLDivElement | null = null;
  let frame = 0;
  let lastRange = '';

  const currentRect = () => {
    const x = origin.x - scrollLeft();
    const y = origin.y - scrollTop();
    return new DOMRect(
      Math.min(x, pointer.x),
      Math.min(y, pointer.y),
      Math.abs(pointer.x - x),
      Math.abs(pointer.y - y),
    );
  };

  const update = () => {
    const rect = currentRect();
    if (overlay) {
      overlay.style.transform = `translate(${rect.x}px, ${rect.y}px)`;
      overlay.style.width = `${rect.width}px`;
      overlay.style.height = `${rect.height}px`;
    }
    const range = blockRangeInRect(view, rect);
    const key = range ? `${range.from}-${range.to}` : '';
    if (key !== lastRange) {
      lastRange = key;
      handlers.select(range);
    }
  };

  // 화면 위아래 끝 가까이에 있으면 스크롤하고 사각형을 다시 계산한다.
  const autoScroll = () => {
    frame = 0;
    const bounds = container
      ? container.getBoundingClientRect()
      : new DOMRect(0, 0, window.innerWidth, window.innerHeight);
    let speed = 0;
    if (pointer.y < bounds.top + SCROLL_EDGE) {
      speed = -Math.min(
        1,
        (bounds.top + SCROLL_EDGE - pointer.y) / SCROLL_EDGE,
      );
    } else if (pointer.y > bounds.bottom - SCROLL_EDGE) {
      speed = Math.min(
        1,
        (pointer.y - (bounds.bottom - SCROLL_EDGE)) / SCROLL_EDGE,
      );
    }
    if (speed === 0) return;
    const before = scrollTop();
    const delta = Math.round(speed * SCROLL_MAX_SPEED) || Math.sign(speed);
    if (container) container.scrollTop += delta;
    else window.scrollBy(0, delta);
    if (scrollTop() !== before) update();
    frame = requestAnimationFrame(autoScroll);
  };

  const onMove = (event: MouseEvent) => {
    pointer = { x: event.clientX, y: event.clientY };
    if (!dragging) {
      const moved = Math.hypot(
        event.clientX - start.clientX,
        event.clientY - start.clientY,
      );
      if (moved < DRAG_THRESHOLD) return;
      dragging = true;
      overlay = document.createElement('div');
      overlay.className = 'marquee-selection';
      document.body.appendChild(overlay);
    }
    event.preventDefault();
    update();
    if (!frame) frame = requestAnimationFrame(autoScroll);
  };

  const stop = (event: MouseEvent) => {
    window.removeEventListener('mousemove', onMove, true);
    window.removeEventListener('mouseup', stop, true);
    if (frame) cancelAnimationFrame(frame);
    overlay?.remove();
    if (dragging) handlers.finish();
    else handlers.click(event);
  };

  window.addEventListener('mousemove', onMove, true);
  window.addEventListener('mouseup', stop, true);
}
