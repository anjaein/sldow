// 여러 블록을 고른 채 손잡이로 끌면 고른 블록 전체를 옮긴다.
// BlockNote의 손잡이 끌기는 자기 여러 블록 선택(MultipleNodeSelection)만 알아보고, 그 밖에는
// 손잡이 블록 하나를 고른다. 그 처리를 그대로 한 뒤 선택과 끄는 내용만 고른 블록 전체로 바꾼다.
// 놓을 때는 BlockNote가 끄는 내용을 놓을 자리에 넣고 지금 선택(고른 블록들)을 지운다.
import {
  selectedFragmentToHTML,
  type BlockNoteEditor,
  type BlockSchema,
  type InlineContentSchema,
  type StyleSchema,
} from '@blocknote/core';
import type { EditorView } from '@tiptap/pm/view';
import {
  BlockRangeSelection,
  createBlockSelection,
  type BlockRange,
} from './blockSelection';

let preview: HTMLElement | null = null;

// 손잡이 블록이 들어 있는 여러 블록 선택
export function draggedBlockRange(
  view: EditorView,
  blockPos: number,
): BlockRange | null {
  const { selection } = view.state;
  if (!(selection instanceof BlockRangeSelection)) return null;
  if (blockPos < selection.from || blockPos >= selection.to) return null;
  return { from: selection.from, to: selection.to };
}

// 끄는 동안 보일 모습: 고른 블록들을 복제해 화면 밖 같은 자리에 둔다(BlockNote와 같은 방식).
function createPreview(view: EditorView, range: BlockRange) {
  const first = view.nodeDOM(range.from);
  const group = first instanceof HTMLElement ? first.parentElement : null;
  if (!group) return null;
  const clone = group.cloneNode(false) as HTMLElement;
  let pos = range.from;
  while (pos < range.to) {
    const node = view.state.doc.nodeAt(pos)!;
    const dom = view.nodeDOM(pos);
    if (dom instanceof HTMLElement) clone.appendChild(dom.cloneNode(true));
    pos += node.nodeSize;
  }
  const inherited = view.dom.className
    .split(' ')
    .filter((name) => !['ProseMirror', 'bn-root', 'bn-editor'].includes(name));
  clone.className = [clone.className, 'bn-drag-preview', ...inherited].join(
    ' ',
  );
  document.body.appendChild(clone);
  return clone;
}

export function dragBlockRange<
  B extends BlockSchema,
  I extends InlineContentSchema,
  S extends StyleSchema,
>(
  editor: BlockNoteEditor<B, I, S>,
  dataTransfer: DataTransfer,
  range: BlockRange,
) {
  const view = editor.prosemirrorView;
  view.dispatch(
    view.state.tr.setSelection(createBlockSelection(view.state.doc, range)),
  );
  const { clipboardHTML, externalHTML, markdown } = selectedFragmentToHTML(
    view,
    editor,
  );
  dataTransfer.clearData();
  dataTransfer.setData('blocknote/html', clipboardHTML);
  dataTransfer.setData('text/html', externalHTML);
  dataTransfer.setData('text/plain', markdown);
  dataTransfer.effectAllowed = 'move';

  clearRangeDragPreview();
  preview = createPreview(view, range);
  if (preview) dataTransfer.setDragImage(preview, 0, 0);
}

export function clearRangeDragPreview() {
  preview?.remove();
  preview = null;
}
