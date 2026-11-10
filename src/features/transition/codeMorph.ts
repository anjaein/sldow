// 코드 모핑 전환. 이전 코드와 새 코드를 토큰으로 나눠 짝을 맞추고,
// 짝이 있는 토큰은 새 자리로 미끄러지고, 없어진 토큰은 사라지고, 생긴 토큰은 나타난다.
// 탭뿐 아니라 이후 애니메이션 블록도 쓰므로 특정 블록을 알지 못한다.
// 실제 글자는 잠시 숨기고 그 위에 임시 층을 그리며, 문서와 편집 DOM은 건드리지 않는다.

export type CodeTokenKind =
  'newline' | 'space' | 'comment' | 'string' | 'number' | 'word' | 'punct';

export interface CodeToken {
  kind: CodeTokenKind;
  text: string;
  start: number;
}

// 이보다 토큰이 많으면 움직임이 버거워지므로 호출한 쪽이 일반 전환을 쓴다.
export const MAX_MORPH_TOKENS = 2000;

// 앞에서부터 처음 맞는 규칙을 쓴다. 문자열과 주석은 줄을 넘지 않게 끊는다.
const TOKEN_RULES: [CodeTokenKind, RegExp][] = [
  ['newline', /\r?\n/y],
  ['space', /[^\S\n]+/y],
  ['comment', /\/\/[^\n]*|#[^\n]*|\/\*[^\n]*?(?:\*\/|$)/my],
  ['string', /"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?|`(?:\\.|[^`\\\n])*`?/y],
  ['number', /\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?[a-z]*/iy],
  ['word', /[\p{L}\p{N}_$]+/uy],
];

export function tokenizeCode(code: string): CodeToken[] {
  const tokens: CodeToken[] = [];
  let index = 0;
  while (index < code.length) {
    let token: CodeToken | null = null;
    for (const [kind, rule] of TOKEN_RULES) {
      rule.lastIndex = index;
      const match = rule.exec(code);
      if (match && match[0].length > 0) {
        token = { kind, text: match[0], start: index };
        break;
      }
    }
    // 나머지는 한 글자씩 기호로 본다. 서로게이트 쌍은 쪼개지 않는다.
    token ??= {
      kind: 'punct',
      text: String.fromCodePoint(code.codePointAt(index)!),
      start: index,
    };
    tokens.push(token);
    index += token.text.length;
  }
  return tokens;
}

const isVisible = (token: CodeToken) =>
  token.kind !== 'space' && token.kind !== 'newline';

// 두 토큰 목록의 짝 [이전 번호, 새 번호]. 먼저 순서를 지키는 최장 공통 부분열로 맞추고,
// 남은 것 중 같은 이름·문자열은 순서대로 이어 줘 옮겨진 줄도 미끄러지게 한다.
export function matchTokens(
  from: readonly string[],
  to: readonly string[],
): [number, number][] {
  const pairs: [number, number][] = [];
  let head = 0;
  while (head < from.length && head < to.length && from[head] === to[head]) {
    pairs.push([head, head]);
    head++;
  }
  let tail = 0;
  while (
    tail < from.length - head &&
    tail < to.length - head &&
    from[from.length - 1 - tail] === to[to.length - 1 - tail]
  ) {
    tail++;
  }

  // 가운데 부분만 표로 푼다. lengths[i][j] = from[i..]와 to[j..]의 공통 부분열 길이
  const n = from.length - head - tail;
  const m = to.length - head - tail;
  const width = m + 1;
  const lengths = new Uint16Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lengths[i * width + j] =
        from[head + i] === to[head + j]
          ? lengths[(i + 1) * width + j + 1] + 1
          : Math.max(lengths[(i + 1) * width + j], lengths[i * width + j + 1]);
    }
  }
  const usedFrom = new Set<number>();
  const usedTo = new Set<number>();
  for (let i = 0, j = 0; i < n && j < m;) {
    if (from[head + i] === to[head + j]) {
      pairs.push([head + i, head + j]);
      usedFrom.add(i);
      usedTo.add(j);
      i++;
      j++;
    } else if (lengths[(i + 1) * width + j] >= lengths[i * width + j + 1]) {
      i++;
    } else {
      j++;
    }
  }

  // 옮겨진 이름: 기호처럼 흔한 한 글자는 엉뚱한 곳끼리 이어지기 쉬워 뺀다.
  const waiting = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const text = from[head + i];
    if (usedFrom.has(i) || !/[\p{L}\p{N}_$"'`]{2}/u.test(text)) continue;
    const list = waiting.get(text) ?? [];
    list.push(head + i);
    waiting.set(text, list);
  }
  for (let j = 0; j < m; j++) {
    if (usedTo.has(j)) continue;
    const match = waiting.get(to[head + j])?.shift();
    if (match !== undefined) pairs.push([match, head + j]);
  }

  for (let k = 0; k < tail; k++) {
    pairs.push([from.length - tail + k, to.length - tail + k]);
  }
  return pairs;
}

export interface CodeMorphTarget {
  // 글자가 들어 있는 요소(예: <code>). 새 코드는 모핑하는 동안 투명해진다.
  text: HTMLElement;
  // 글자가 잘려 보이는 영역(예: 가로 스크롤되는 <pre>). 없으면 text 영역이다.
  clip?: HTMLElement;
  // 코드의 바탕 상자(예: 어두운 코드 블록). 주면 바탕도 이전 크기에서 새 크기로 늘거나 준다.
  box?: HTMLElement;
}

// 바뀌기 전에 찍어 둔 코드의 모습. 화면이 바뀐 뒤에는 이전 코드가 없을 수 있어 미리 잰다.
export interface CodeSnapshot {
  texts: string[];
  tokens: (PlacedToken | null)[];
  clip: DOMRect;
  style: TextStyle;
  box: MeasuredBox | null;
}

export interface CodeMorphPair {
  from: CodeSnapshot;
  to: CodeMorphTarget;
}

export interface CodeMorphOptions {
  // 임시 층을 넣을 위치 기준 요소(position이 static이 아니어야 한다).
  container: HTMLElement;
  duration: number;
  easing: string;
}

export interface CodeMorph {
  animations: Animation[];
  // 임시 층을 지우고 숨긴 글자를 되돌린다.
  cancel: () => void;
}

type TextStyle = Partial<Record<(typeof COPIED_STYLES)[number], string>>;

interface PlacedToken {
  text: string;
  x: number;
  y: number;
  height: number;
  style: TextStyle;
}

interface MeasuredBox {
  rect: DOMRect;
  background: string;
  radius: string;
}

const relativeRect = (element: Element, origin: DOMRect) => {
  const rect = element.getBoundingClientRect();
  return new DOMRect(
    rect.left - origin.left,
    rect.top - origin.top,
    rect.width,
    rect.height,
  );
};

function measureBox(box: Element, origin: DOMRect): MeasuredBox {
  const style = getComputedStyle(box);
  return {
    rect: relativeRect(box, origin),
    background: style.backgroundColor,
    radius: style.borderRadius,
  };
}

const COPIED_STYLES = [
  'color',
  'fontFamily',
  'fontSize',
  'fontStyle',
  'fontWeight',
  'fontStretch',
  'fontFeatureSettings',
  'fontVariantLigatures',
  'letterSpacing',
  'tabSize',
] as const;

function copyTextStyle(element: Element): TextStyle {
  const computed = getComputedStyle(element);
  const style: TextStyle = {};
  for (const key of COPIED_STYLES) style[key] = computed[key];
  return style;
}

// 층 전체에 준 글꼴과 다른 값만 남긴다. 강조 표시가 없는 코드면 비어 있다.
function styleDifference(style: TextStyle, base: TextStyle): TextStyle {
  const difference: TextStyle = {};
  for (const key of COPIED_STYLES) {
    if (style[key] !== base[key]) difference[key] = style[key];
  }
  return difference;
}

// 글자 하나하나의 실제 자리를 Range로 잰다. 강조 표시 등으로 글자가 여러 노드에
// 나뉘어 있어도 이어 붙인 문자열의 위치로 찾는다.
function measure(
  target: CodeMorphTarget,
  origin: DOMRect,
): CodeSnapshot | null {
  const walker = document.createTreeWalker(target.text, NodeFilter.SHOW_TEXT);
  const nodes: { node: Text; start: number }[] = [];
  let code = '';
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    nodes.push({ node: node as Text, start: code.length });
    code += (node as Text).data;
  }

  const visible = tokenizeCode(code).filter(isVisible);
  if (visible.length > MAX_MORPH_TOKENS) return null;

  // 토큰은 앞에서부터 차례로 찾으므로 글자 노드도 앞으로만 나아간다.
  let cursor = 0;
  const locate = (offset: number, atEnd: boolean) => {
    while (
      cursor + 1 < nodes.length &&
      (atEnd
        ? nodes[cursor + 1].start < offset
        : nodes[cursor + 1].start <= offset)
    ) {
      cursor++;
    }
    return { node: nodes[cursor].node, offset: offset - nodes[cursor].start };
  };

  const base = copyTextStyle(target.text);
  const styles = new Map<Element, TextStyle>([[target.text, {}]]);
  const range = document.createRange();
  const tokens = visible.map((token): PlacedToken | null => {
    const start = locate(token.start, false);
    range.setStart(start.node, start.offset);
    const end = locate(token.start + token.text.length, true);
    range.setEnd(end.node, end.offset);
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return null;
    const owner = start.node.parentElement ?? target.text;
    if (!styles.has(owner)) {
      styles.set(owner, styleDifference(copyTextStyle(owner), base));
    }
    return {
      text: token.text,
      x: rect.left - origin.left,
      y: rect.top - origin.top,
      height: rect.height,
      style: styles.get(owner)!,
    };
  });

  return {
    texts: visible.map((token) => token.text),
    tokens,
    clip: relativeRect(target.clip ?? target.text, origin),
    style: base,
    box: target.box ? measureBox(target.box, origin) : null,
  };
}

// 위·왼쪽 기준 좌표로만 정해, 전환 중 기준 요소의 크기가 바뀌어도 영역이 어긋나지 않는다.
const clipPath = ({ left, top, right, bottom }: DOMRect) =>
  `polygon(${left}px ${top}px, ${right}px ${top}px, ${right}px ${bottom}px, ${left}px ${bottom}px)`;

const ABSOLUTE = 'position:absolute;left:0;top:0;';

function createTokenElement(
  token: PlacedToken,
  codeStyle: TextStyle,
  layerStyle: TextStyle,
) {
  const span = document.createElement('span');
  span.textContent = token.text;
  // 잰 높이를 줄 높이로 주면 글자가 잰 자리와 같은 기준선에 놓인다.
  span.style.cssText = `position:absolute;left:${token.x}px;top:${token.y}px;line-height:${token.height}px;`;
  // 글꼴은 층에서 물려받고, 층과 다른 값(강조 색, 이전 코드의 글꼴)만 덧입힌다.
  Object.assign(
    span.style,
    styleDifference({ ...codeStyle, ...token.style }, layerStyle),
  );
  return span;
}

// 위치는 임시 층을 넣을 요소의 안쪽 왼쪽 위 기준이다.
function originOf(container: HTMLElement) {
  const rect = container.getBoundingClientRect();
  return new DOMRect(
    rect.left + container.clientLeft,
    rect.top + container.clientTop,
  );
}

// 바뀌기 전의 코드를 찍어 둔다. 토큰이 너무 많으면 null이다.
// 찍은 뒤 모핑을 시작할 때까지 container는 같은 자리에 있어야 한다.
export function snapshotCode(
  target: CodeMorphTarget,
  container: HTMLElement,
): CodeSnapshot | null {
  return measure(target, originOf(container));
}

// 새 코드가 제자리에 그려진 뒤 부른다. 잴 수 없거나 너무 길면 null을 돌려주고 아무것도 바꾸지 않는다.
export function startCodeMorph(
  pairs: readonly CodeMorphPair[],
  { container, duration, easing }: CodeMorphOptions,
): CodeMorph | null {
  const origin = originOf(container);
  const measured: [CodeSnapshot, CodeSnapshot][] = [];
  for (const { from, to } of pairs) {
    const after = measure(to, origin);
    if (!after) return null;
    measured.push([from, after]);
  }

  const timing: KeyframeAnimationOptions = {
    duration,
    easing,
    fill: 'forwards',
  };
  const animations: Animation[] = [];
  const layers: HTMLElement[] = [];

  for (const [before, after] of measured) {
    const layer = document.createElement('div');
    layer.setAttribute('aria-hidden', 'true');
    layer.style.cssText = `${ABSOLUTE}width:100%;height:100%;user-select:none;`;

    // 바탕 상자: 두 상자를 겹쳐 흐리는 대신 하나의 상자가 새 크기로 늘거나 준다.
    if (before.box && after.box) {
      const box = document.createElement('div');
      box.style.cssText = ABSOLUTE;
      layer.append(box);
      const frame = ({ rect, background, radius }: MeasuredBox) => ({
        transform: `translate(${rect.x}px, ${rect.y}px)`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        backgroundColor: background,
        borderRadius: radius,
      });
      animations.push(
        box.animate([frame(before.box), frame(after.box)], timing),
      );
    }

    // 글꼴은 새 코드 기준으로 한 번만 주고 토큰은 물려받는다.
    const text = document.createElement('div');
    text.style.cssText = `${ABSOLUTE}width:100%;height:100%;white-space:pre;`;
    Object.assign(text.style, after.style);
    layer.append(text);

    // 같은 거리만큼 움직이는 토큰(대개 한 줄)은 한 묶음으로 움직여 애니메이션 수를 줄인다.
    const groups = new Map<string, HTMLElement>();
    const groupFor = (key: string, keyframes: Keyframe[] | null) => {
      let group = groups.get(key);
      if (!group) {
        group = document.createElement('div');
        group.style.cssText = ABSOLUTE;
        text.append(group);
        groups.set(key, group);
        if (keyframes) animations.push(group.animate(keyframes, timing));
      }
      return group;
    };

    const matchedFrom = new Set<number>();
    const matchedTo = new Set<number>();
    for (const [i, j] of matchTokens(before.texts, after.texts)) {
      const old = before.tokens[i];
      const next = after.tokens[j];
      if (!old || !next) continue;
      matchedFrom.add(i);
      matchedTo.add(j);
      const dx = Math.round((old.x - next.x) * 100) / 100;
      const dy = Math.round((old.y - next.y) * 100) / 100;
      // 제자리 토큰도 그린다. 실제 글자는 전환 동안 숨겨져 있다.
      const group = groupFor(
        `${dx} ${dy}`,
        dx === 0 && dy === 0
          ? null
          : [
              { transform: `translate(${dx}px, ${dy}px)` },
              { transform: 'none' },
            ],
      );
      group.append(createTokenElement(next, after.style, after.style));
    }

    // 없어지는 토큰은 앞쪽에서 사라지고, 생기는 토큰은 뒤쪽에서 나타나 잠깐만 겹친다.
    before.tokens.forEach((token, i) => {
      if (!token || matchedFrom.has(i)) return;
      groupFor('leave', [
        { opacity: 1 },
        { opacity: 0, offset: 0.6 },
        { opacity: 0 },
      ]).append(createTokenElement(token, before.style, after.style));
    });
    after.tokens.forEach((token, j) => {
      if (!token || matchedTo.has(j)) return;
      groupFor('enter', [
        { opacity: 0 },
        { opacity: 0, offset: 0.4 },
        { opacity: 1 },
      ]).append(createTokenElement(token, after.style, after.style));
    });

    // 글자가 보이는 영역도 이전 코드 영역에서 새 코드 영역으로 옮긴다.
    animations.push(
      text.animate(
        [
          { clipPath: clipPath(before.clip) },
          { clipPath: clipPath(after.clip) },
        ],
        timing,
      ),
    );
    container.append(layer);
    layers.push(layer);
  }

  // 새 코드의 실제 글자(와 바탕)는 끝날 때까지 숨긴다. 스타일 속성을 바꾸지 않아 편집기가 알아채지 않는다.
  const hidden = { opacity: 0, caretColor: 'transparent' };
  const noBackground = { backgroundColor: 'transparent' };
  pairs.forEach(({ to }, index) => {
    const [before, after] = measured[index];
    animations.push(to.text.animate([hidden, hidden], timing));
    if (to.box && before.box && after.box) {
      animations.push(to.box.animate([noBackground, noBackground], timing));
    }
  });

  return {
    animations,
    cancel: () => {
      animations.forEach((animation) => animation.cancel());
      layers.forEach((layer) => layer.remove());
    },
  };
}
