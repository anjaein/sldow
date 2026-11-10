// 노션식 블록 선택과 블록 붙여넣기.
// - Esc: 글을 쓰던 블록(또는 글 범위가 걸친 블록들)을 블록째 고른다. 고른 상태에서 다시 누르면 풀린다.
// - Shift+↑/↓: 고른 블록을 같은 묶음 안에서 한 블록씩 늘리거나 줄인다.
// - 고른 블록은 화면에 옅은 파랑으로 덮어 보인다.
// - 블록째 복사한 내용의 붙여넣기 자리를 바꾼다(blockPaste).
// 복사·잘라내기·삭제는 BlockNote가 블록 선택을 블록 단위로 이미 처리한다.
import { createExtension } from '@blocknote/core';
import { SuggestionMenu } from '@blocknote/core/extensions';
import {
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
  type Selection,
} from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import {
  blockRangeAround,
  blockRangeTo,
  blockSelectionRange,
  createBlockSelection,
  extendBlockRange,
  type BlockRange,
} from './blockSelection';
import { BLOCKNOTE_HTML, parseCopiedBlocks, pasteBlocks } from './blockPaste';

// Shift로 늘릴 때 움직이지 않는 쪽 블록의 시작 위치. 블록 선택이 풀리면 지운다.
interface SelectionAnchor {
  anchor: number | null;
}

export const blockSelectionKey = new PluginKey<SelectionAnchor>(
  'blockSelection',
);

export function selectBlocks(
  view: EditorView,
  range: BlockRange,
  anchor = range.from,
) {
  const tr = view.state.tr.setSelection(
    createBlockSelection(view.state.doc, range),
  );
  view.dispatch(tr.setMeta(blockSelectionKey, anchor).scrollIntoView());
}

// 블록 손잡이 클릭. Shift를 누르면 이미 고른 블록에서 이 블록까지 늘린다.
export function selectBlockFromHandle(
  view: EditorView,
  blockPos: number,
  extend: boolean,
) {
  const { state } = view;
  const current = blockSelectionRange(state.selection);
  const anchor = current
    ? (blockSelectionKey.getState(state)?.anchor ?? current.from)
    : null;
  const range = blockRangeTo(state.doc, extend ? anchor : null, blockPos);
  selectBlocks(view, range, extend && anchor !== null ? anchor : blockPos);
}

function collapseBlockSelection(view: EditorView, selection: Selection) {
  // 고른 블록 앞쪽의 글 자리로 돌린다. 글이 없으면 그대로 둔다.
  const $from = view.state.doc.resolve(selection.from);
  const text = TextSelection.findFrom($from, 1, true);
  if (text) view.dispatch(view.state.tr.setSelection(text));
}

function handleKeyDown(
  view: EditorView,
  event: KeyboardEvent,
  isMenuShown: () => boolean,
): boolean {
  if (event.isComposing) return false;
  const { state } = view;
  const range = blockSelectionRange(state.selection);
  const plain = !event.altKey && !event.ctrlKey && !event.metaKey;

  if (event.key === 'Escape' && plain && !event.shiftKey) {
    if (isMenuShown()) return false;
    if (range) {
      // 두 번째 Esc는 선택을 풀고, BlockNote 기본 동작(편집기 벗어나기)으로 넘긴다.
      collapseBlockSelection(view, state.selection);
      return false;
    }
    const around = blockRangeAround(state.selection);
    if (!around) return false;
    selectBlocks(view, around);
    return true;
  }

  if (!range) return false;

  if (
    (event.key === 'ArrowUp' || event.key === 'ArrowDown') &&
    event.shiftKey &&
    plain
  ) {
    const anchor = blockSelectionKey.getState(state)?.anchor ?? null;
    const next = extendBlockRange(
      state.doc,
      range,
      anchor,
      event.key === 'ArrowUp' ? -1 : 1,
    );
    if (next) selectBlocks(view, next.range, next.anchor);
    return true;
  }

  // 노션처럼 고른 블록 아래에 빈 문단을 만들어 옮겨 간다.
  if (event.key === 'Enter' && plain && !event.shiftKey) {
    const { blockContainer, paragraph } = state.schema.nodes;
    const tr = state.tr.insert(
      range.to,
      blockContainer.create(null, paragraph.create()),
    );
    // 블록 안(+1), 문단 안(+1)
    tr.setSelection(TextSelection.create(tr.doc, range.to + 2));
    view.dispatch(tr.scrollIntoView());
    return true;
  }

  // 여러 블록을 고른 채 글자를 치면 브라우저가 고른 영역을 글로 덮어쓴다.
  // 블록 하나(NodeSelection)는 BlockNote가 이미 막으므로 같은 규칙을 여러 블록에도 건다.
  if (plain && (event.key.length === 1 || event.key === 'Process')) {
    event.preventDefault();
    return true;
  }
  return false;
}

function blockDecorations(state: EditorState) {
  const range = blockSelectionRange(state.selection);
  if (!range) return DecorationSet.empty;
  const decorations: Decoration[] = [];
  state.doc.nodesBetween(range.from, range.to, (node, pos) => {
    if (pos < range.from || pos + node.nodeSize > range.to) return true;
    decorations.push(
      Decoration.node(pos, pos + node.nodeSize, {
        class: 'block-selected',
      }),
    );
    return false;
  });
  return DecorationSet.create(state.doc, decorations);
}

export const blockSelectionExtension = createExtension(({ editor }) => {
  const isMenuShown = () => !!editor.getExtension(SuggestionMenu)?.shown();
  return {
    key: 'blockSelection',
    prosemirrorPlugins: [
      new Plugin<SelectionAnchor>({
        key: blockSelectionKey,
        state: {
          init: () => ({ anchor: null }),
          apply(tr, value, _oldState, newState) {
            const meta = tr.getMeta(blockSelectionKey) as number | undefined;
            if (meta !== undefined) return { anchor: meta };
            if (!blockSelectionRange(newState.selection)) {
              return { anchor: null };
            }
            if (value.anchor === null || !tr.docChanged) return value;
            return { anchor: tr.mapping.map(value.anchor) };
          },
        },
        props: {
          decorations: blockDecorations,
          handleKeyDown: (view, event) =>
            handleKeyDown(view, event, isMenuShown),
          handleDOMEvents: {
            // BlockNote의 붙여넣기보다 먼저 받는다. 블록째 복사한 것이 아니면 BlockNote에 맡긴다.
            paste(view, event) {
              if (!view.editable) return false;
              const html = event.clipboardData?.getData(BLOCKNOTE_HTML);
              if (!html) return false;
              const blocks = parseCopiedBlocks(view, html);
              if (!blocks || !pasteBlocks(view, blocks)) return false;
              event.preventDefault();
              return true;
            },
          },
        },
      }),
    ],
  } as const;
});
