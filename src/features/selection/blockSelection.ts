// 블록을 통째로 고른 상태(블록 선택) 다루기.
// 블록 하나는 블록 노드(blockContainer)의 NodeSelection, 여러 개는 BlockRangeSelection이다.
// BlockNote의 복사·잘라내기·삭제는 선택의 content()와 deleteSelection을 쓰므로,
// 블록 노드들을 그대로 내놓는 선택이면 블록 단위로 복사되고 지워진다.
import {
  Fragment,
  Slice,
  type Node as PMNode,
  type ResolvedPos,
} from '@tiptap/pm/model';
import { NodeSelection, Selection } from '@tiptap/pm/state';
import type { Mappable } from '@tiptap/pm/transform';

// 선택은 첫 블록 바로 앞에서 끝 블록 바로 뒤까지다. 두 위치는 같은 블록 묶음 안에 있다.
export interface BlockRange {
  from: number;
  to: number;
}

const BLOCK_RANGE = 'blockRange';

// BlockNote가 블록 끌기에 쓰는 MultipleNodeSelection과 같은 모양의 선택.
// 그 클래스는 패키지 밖으로 내보내지 않아 직접 만든다.
export class BlockRangeSelection extends Selection {
  constructor($from: ResolvedPos, $to: ResolvedPos) {
    super($from, $to);
  }

  // 같은 묶음에 있는 블록 노드들을 열린 곳 없이(0 0) 내놓아, 붙일 때 블록째로 알아볼 수 있다.
  content(): Slice {
    const blocks: PMNode[] = [];
    this.$from.doc.nodesBetween(this.from, this.to, (node, pos) => {
      if (pos < this.from) return true;
      blocks.push(node);
      return false;
    });
    return new Slice(Fragment.from(blocks), 0, 0);
  }

  eq(other: Selection): boolean {
    return (
      other instanceof BlockRangeSelection &&
      other.from === this.from &&
      other.to === this.to
    );
  }

  map(doc: PMNode, mapping: Mappable): Selection {
    const from = mapping.mapResult(this.from, 1);
    const to = mapping.mapResult(this.to, -1);
    if (from.deleted || to.deleted || from.pos >= to.pos) {
      return Selection.near(doc.resolve(from.pos));
    }
    return new BlockRangeSelection(doc.resolve(from.pos), doc.resolve(to.pos));
  }

  // JSON으로 되살릴 일이 없어 Selection.jsonID로 등록하지 않는다.
  // (등록하면 개발 중 파일을 다시 불러올 때 같은 이름이 겹쳐 오류가 난다.)
  toJSON() {
    return { type: BLOCK_RANGE, anchor: this.anchor, head: this.head };
  }
}
// 글 선택처럼 칠하지 않고 블록 강조(장식)로만 보인다.
BlockRangeSelection.prototype.visible = false;

// BlockNote가 블록을 끌 때 만드는 선택
const MULTIPLE_NODE_SELECTION = 'multiple-node';

const isBlock = (node: PMNode | null | undefined) =>
  node?.type.name === 'blockContainer';

const isTabsBlock = (node: PMNode | null | undefined) =>
  isBlock(node) && node!.firstChild?.type.name === 'tabs';

export function blockSelectionRange(selection: Selection): BlockRange | null {
  if (selection instanceof NodeSelection) {
    return isBlock(selection.node)
      ? { from: selection.from, to: selection.to }
      : null;
  }
  const isRange =
    selection instanceof BlockRangeSelection ||
    selection.toJSON().type === MULTIPLE_NODE_SELECTION;
  if (isRange && selection.$from.parent.type.name === 'blockGroup') {
    return { from: selection.from, to: selection.to };
  }
  return null;
}

export function createBlockSelection(doc: PMNode, range: BlockRange) {
  const first = doc.nodeAt(range.from);
  if (first && range.from + first.nodeSize === range.to) {
    return NodeSelection.create(doc, range.from);
  }
  return new BlockRangeSelection(
    doc.resolve(range.from),
    doc.resolve(range.to),
  );
}

// 지금 선택(글 커서, 글 범위, 블록 내용 선택)이 걸친 블록들. 노션의 Esc처럼 블록 선택으로 바꿀 때 쓴다.
// 패널(tabPanel)은 고를 수 없으므로, 탭 블록의 패널 묶음에 닿으면 탭 블록 전체를 고른다.
export function blockRangeAround(selection: Selection): BlockRange | null {
  const { $from, $to } = selection;
  let depth = $from.sharedDepth($to.pos);
  while (depth > 0) {
    const isGroup = $from.node(depth).type.name === 'blockGroup';
    if (isGroup && !isTabsBlock($from.node(depth - 1))) break;
    depth--;
  }
  if ($from.node(depth).type.name !== 'blockGroup') return null;

  const from = $from.depth > depth ? $from.before(depth + 1) : $from.pos;
  const to = $to.depth > depth ? $to.after(depth + 1) : $to.pos;
  return from < to ? { from, to } : null;
}

// 블록 묶음 안에서 index번째 블록의 시작 위치
function childStart(groupStart: number, group: PMNode, index: number) {
  let position = groupStart;
  for (let i = 0; i < index; i++) position += group.child(i).nodeSize;
  return position;
}

// 고른 블록들 중 고정점(anchor)에서 반대쪽 끝을 한 블록씩 늘리거나 줄인다.
// 같은 묶음 안에서만 움직여 패널이나 부모 블록의 경계를 넘지 않는다.
export function extendBlockRange(
  doc: PMNode,
  range: BlockRange,
  anchor: number | null,
  direction: -1 | 1,
): { range: BlockRange; anchor: number } | null {
  const $from = doc.resolve(range.from);
  const group = $from.parent;
  const groupStart = $from.start();
  const first = $from.index();
  const last = doc.resolve(range.to).index() - 1;

  let anchorIndex = first;
  if (anchor !== null && anchor >= range.from && anchor < range.to) {
    const $anchor = doc.resolve(anchor);
    if ($anchor.parent === group && $anchor.index() === last) {
      anchorIndex = last;
    }
  }
  const headIndex = anchorIndex === first ? last : first;
  const nextHead = Math.min(
    group.childCount - 1,
    Math.max(0, headIndex + direction),
  );
  if (nextHead === headIndex) return null;

  const low = Math.min(anchorIndex, nextHead);
  const high = Math.max(anchorIndex, nextHead);
  return {
    range: {
      from: childStart(groupStart, group, low),
      to: childStart(groupStart, group, high) + group.child(high).nodeSize,
    },
    anchor: childStart(groupStart, group, anchorIndex),
  };
}

// 고정점 블록에서 target 블록까지. 다른 묶음에 있으면 target 블록만 고른다.
export function blockRangeTo(
  doc: PMNode,
  anchor: number | null,
  target: number,
): BlockRange {
  const $target = doc.resolve(target);
  const targetEnd = target + doc.nodeAt(target)!.nodeSize;
  if (anchor === null) return { from: target, to: targetEnd };
  const $anchor = doc.resolve(anchor);
  if ($anchor.parent !== $target.parent) return { from: target, to: targetEnd };
  const anchorEnd = anchor + doc.nodeAt(anchor)!.nodeSize;
  return {
    from: Math.min(anchor, target),
    to: Math.max(anchorEnd, targetEnd),
  };
}
