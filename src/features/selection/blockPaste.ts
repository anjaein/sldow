// 블록을 통째로 복사한 내용을 노션처럼 블록 아래에 붙인다.
// 복사는 BlockNote가 맡는다. 블록 선택을 복사하면 내부 HTML(blocknote/html)에 블록 노드가
// 속성과 자식까지 그대로 담기므로, 직접 만든 블록(탭, 디자인)도 손실 없이 돌아온다.
// BlockNote의 기본 붙여넣기는 커서 자리에서 문단을 쪼개 끼워 넣으므로 자리만 바꾼다.
import { getBlockInfoFromSelection } from '@blocknote/core';
import {
  DOMParser as PMDOMParser,
  Fragment,
  type Node as PMNode,
  type Schema,
} from '@tiptap/pm/model';
import { NodeSelection, Selection, TextSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { blockSelectionRange } from './blockSelection';

export const BLOCKNOTE_HTML = 'blocknote/html';

// 붙인 블록은 새 블록이므로 id를 비운다. 비운 id는 BlockNote가 새로 채운다.
function withoutIds(node: PMNode): PMNode {
  if (node.isText) return node;
  const children: PMNode[] = [];
  node.forEach((child) => children.push(withoutIds(child)));
  const attrs = 'id' in node.attrs ? { ...node.attrs, id: null } : node.attrs;
  return node.type.create(attrs, children, node.marks);
}

// ProseMirror는 복사한 조각의 열린 깊이를 data-pm-slice="열린앞 열린뒤 [문맥]"으로 남긴다.
// 둘 다 0이고 첫 요소가 블록이면 블록을 통째로 복사한 것이다. 글 일부를 복사했으면 null.
export function parseCopiedBlocks(
  view: EditorView,
  html: string,
): PMNode[] | null {
  view.someProp('transformPastedHTML', (transform) => {
    html = transform(html, view);
  });
  // 스크립트와 이미지가 동작하지 않는 별도 문서에서 읽는다.
  const body = new DOMParser().parseFromString(html, 'text/html').body;
  const marker = body.querySelector('[data-pm-slice]');
  if (
    !marker ||
    !/^0 0 /.test(marker.getAttribute('data-pm-slice') ?? '') ||
    marker.getAttribute('data-node-type') !== 'blockOuter'
  ) {
    return null;
  }

  const schema: Schema = view.state.schema;
  const parser =
    view.someProp('clipboardParser') ??
    view.someProp('domParser') ??
    PMDOMParser.fromSchema(schema);
  const group = parser.parse(body, {
    topNode: schema.nodes.blockGroup.create(),
    preserveWhitespace: true,
  });
  const blocks: PMNode[] = [];
  group.forEach((block) => {
    if (block.type.name === 'blockContainer') blocks.push(withoutIds(block));
  });
  return blocks.length > 0 ? blocks : null;
}

// 붙인 뒤의 선택: 마지막 블록이 글 블록이면 그 끝에 커서를, 아니면 그 블록을 고른다.
// 탭 블록에 커서를 두면 숨은 패널 안으로 들어갈 수 있어 블록째 고른다.
function selectionAfterPaste(doc: PMNode, end: number) {
  const $end = doc.resolve(end);
  const last = $end.nodeBefore;
  if (!last || last.firstChild?.isTextblock) return Selection.near($end, -1);
  return NodeSelection.create(doc, end - last.nodeSize);
}

// 블록 선택이 있으면 그 아래, 글 커서가 빈 문단에 있으면 그 문단 자리, 아니면 커서가 있는 블록 아래에 붙인다.
export function pasteBlocks(view: EditorView, blocks: PMNode[]): boolean {
  const { state } = view;
  const tr = state.tr;
  const range = blockSelectionRange(state.selection);
  let from: number;
  let to: number;

  if (range) {
    from = to = range.to;
  } else {
    // 코드 블록에는 BlockNote처럼 글로만 붙인다.
    const { $from, $to } = state.selection;
    if ($from.parent.type.spec.code && $to.parent.type.spec.code) return false;
    // 글 범위를 고른 채 붙이면 그 글을 지우고 붙인다.
    if (state.selection instanceof TextSelection && !state.selection.empty) {
      tr.deleteSelection();
    }
    const info = getBlockInfoFromSelection(tr);
    if (!info.isBlockContainer) return false;
    const { bnBlock, blockContent } = info;
    const isEmptyParagraph =
      blockContent.node.type.name === 'paragraph' &&
      blockContent.node.content.size === 0 &&
      bnBlock.node.childCount === 1;
    from = isEmptyParagraph ? bnBlock.beforePos : bnBlock.afterPos;
    to = bnBlock.afterPos;
  }

  const fragment = Fragment.from(blocks);
  tr.replaceWith(from, to, fragment);
  const end = from + fragment.size;
  tr.setSelection(selectionAfterPaste(tr.doc, end));
  // 붙여넣기 표시는 탭 구조 규칙(탭 안의 탭 풀기)이 알아본다.
  tr.setMeta('paste', true).setMeta('uiEvent', 'paste');
  view.dispatch(tr.scrollIntoView());
  return true;
}
