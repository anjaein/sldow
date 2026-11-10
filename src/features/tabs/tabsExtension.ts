// 탭 블록의 구조(탭 → tabPanel → 내용)를 지키는 ProseMirror 플러그인.
// BlockNote 스키마는 자식 블록의 종류를 제한할 수 없어서, 들여쓰기 해제나 끌어 놓기로
// 패널이 깨질 수 있다. 깨진 구조를 그 편집과 같은 되돌리기 단계 안에서 고친다.
import { createExtension, getBlockInfoFromSelection } from '@blocknote/core';
import { Fragment, type Node as PMNode } from '@tiptap/pm/model';
import {
  NodeSelection,
  Plugin,
  PluginKey,
  TextSelection,
  type Transaction,
} from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

const blockType = (container: PMNode | null | undefined) =>
  container?.firstChild?.type.name;

const hasChildren = (container: PMNode) => container.childCount === 2;

function createEmptyBlock(tr: Transaction) {
  const { blockContainer, paragraph } = tr.doc.type.schema.nodes;
  return blockContainer.create(null, paragraph.create());
}

function createPanelNode(tr: Transaction, children: Fragment) {
  const { blockContainer, blockGroup, tabPanel } = tr.doc.type.schema.nodes;
  return blockContainer.create(null, [
    tabPanel.create(),
    blockGroup.create(null, children),
  ]);
}

// 패널 바깥으로 나온 블록을 가까운 패널의 내용으로 되돌린다.
function moveOrphanIntoPanel(tr: Transaction, node: PMNode, pos: number) {
  const $pos = tr.doc.resolve(pos);
  const index = $pos.index();
  const siblings = $pos.parent;
  const previous = index > 0 ? siblings.child(index - 1) : null;
  const next =
    index + 1 < siblings.childCount ? siblings.child(index + 1) : null;

  if (previous && blockType(previous) === 'tabPanel' && hasChildren(previous)) {
    tr.delete(pos, pos + node.nodeSize);
    // 앞 패널의 자식 그룹 끝: 블록 닫힘(-1), 그룹 닫힘(-1)
    tr.insert(pos - 2, node);
  } else if (next && blockType(next) === 'tabPanel' && hasChildren(next)) {
    tr.delete(pos, pos + node.nodeSize);
    // 뒤 패널의 자식 그룹 시작: 블록 안(+1), 내용 건너뜀, 그룹 안(+1)
    tr.insert(pos + 1 + next.firstChild!.nodeSize + 1, node);
  } else {
    tr.replaceWith(
      pos,
      pos + node.nodeSize,
      createPanelNode(tr, Fragment.from(node)),
    );
  }
}

// 문서 순서로 첫 번째 문제를 하나만 고친다. 고치면 위치가 바뀌므로 다시 처음부터 본다.
function repairOnce(tr: Transaction): boolean {
  const { blockGroup } = tr.doc.type.schema.nodes;
  let repaired = false;

  tr.doc.descendants((node, pos) => {
    if (repaired || node.isTextblock) return false;
    if (node.type.name !== 'blockContainer') return true;

    const $pos = tr.doc.resolve(pos);
    const parent = $pos.depth >= 2 ? $pos.node($pos.depth - 1) : null;
    const type = blockType(node);
    const end = pos + node.nodeSize;

    if (type === 'tabPanel' && blockType(parent) !== 'tabs') {
      // 탭 밖으로 나온 패널은 껍데기만 없애고 내용을 살린다.
      tr.replaceWith(
        pos,
        end,
        hasChildren(node) ? node.lastChild!.content : createEmptyBlock(tr),
      );
      repaired = true;
    } else if (blockType(parent) === 'tabs' && type !== 'tabPanel') {
      moveOrphanIntoPanel(tr, node, pos);
      repaired = true;
    } else if (type === 'tabPanel' && !hasChildren(node)) {
      tr.insert(end - 1, blockGroup.create(null, createEmptyBlock(tr)));
      repaired = true;
    } else if (type === 'tabs' && !hasChildren(node)) {
      const panel = createPanelNode(tr, Fragment.from(createEmptyBlock(tr)));
      tr.insert(end - 1, blockGroup.create(null, panel));
      repaired = true;
    }
    return !repaired;
  });

  return repaired;
}

// 패널 경계를 넘는 기본 키 동작을 막는다.
function handleBoundaryKey(view: EditorView, event: KeyboardEvent): boolean {
  if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey) {
    return false;
  }
  const { key, shiftKey } = event;
  const isShiftTab = key === 'Tab' && shiftKey;
  const isPlainKey =
    !shiftKey && (key === 'Backspace' || key === 'Delete' || key === 'Enter');
  if (!isShiftTab && !isPlainKey) return false;

  const { state } = view;
  const { selection, doc } = state;

  // 탭 블록을 통째로 선택한 상태의 기본 삭제는 자식이 있는 블록을 지우지 못해
  // 탭과 패널을 문단으로 뭉갠다. 블록 전체를 지우고, Enter는 아래에 새 문단을 만든다.
  if (
    selection instanceof NodeSelection &&
    selection.node.type.name === 'tabs'
  ) {
    if (!isPlainKey) return false;
    const { $from } = selection;
    const start = $from.before();
    const end = $from.after();
    const emptyBlock = createEmptyBlock(state.tr);
    if (key === 'Enter') {
      const tr = state.tr.insert(end, emptyBlock);
      tr.setSelection(TextSelection.create(tr.doc, end + 2));
      view.dispatch(tr.scrollIntoView());
      return true;
    }
    const onlyChild = $from.node($from.depth - 1).childCount === 1;
    view.dispatch(
      onlyChild
        ? state.tr.replaceWith(start, end, emptyBlock)
        : state.tr.delete(start, end),
    );
    return true;
  }

  if (!selection.empty) return false;
  const info = getBlockInfoFromSelection(state);
  if (!info.isBlockContainer) return false;

  const { bnBlock, blockContent } = info;
  const $block = doc.resolve(bnBlock.beforePos);
  const index = $block.index();
  const siblings = $block.parent;
  const parent = $block.depth >= 2 ? $block.node($block.depth - 1) : null;
  const inPanel = blockType(parent) === 'tabPanel';
  const atStart = selection.from === blockContent.beforePos + 1;
  const atEnd = selection.from === blockContent.afterPos - 1;
  const contentType = blockContent.node.type;

  if (isShiftTab) return inPanel;

  if (key === 'Backspace' && atStart) {
    // 문단이 아니면 기본 동작(문단으로 되돌리기)을 그대로 쓴다.
    if (contentType.name !== 'paragraph') return false;
    const previous = index > 0 ? siblings.child(index - 1) : null;
    // 탭 블록 뒤 문단은 숨겨진 패널의 마지막 블록과 합쳐지면 안 된다.
    if (blockType(previous) === 'tabs') return true;
    if (!inPanel) return false;
    // 패널 첫 블록을 지우면 내용이 패널 밖으로 빠지므로 멈춘다.
    if (!previous) return true;

    // 패널의 직계 자식은 들여쓰기 해제 대신 앞 블록과 합친다.
    let bottom = previous;
    let bottomEnd = bnBlock.beforePos;
    while (hasChildren(bottom)) {
      bottom = bottom.lastChild!.lastChild!;
      bottomEnd -= 2;
    }
    if (bottom.firstChild!.type.spec.content === 'inline*') {
      view.dispatch(
        state.tr.delete(bottomEnd - 2, selection.from).scrollIntoView(),
      );
    }
    return true;
  }

  if (key === 'Delete' && atEnd && !hasChildren(bnBlock.node)) {
    // 다음 블록이 탭 블록이거나 패널의 끝이면, 탭 구조가 합쳐지지 않게 멈춘다.
    let $level = $block;
    while (true) {
      if ($level.index() + 1 < $level.parent.childCount) {
        return blockType($level.parent.child($level.index() + 1)) === 'tabs';
      }
      if ($level.depth < 2) return false;
      const owner = $level.node($level.depth - 1);
      if (blockType(owner) === 'tabPanel') return true;
      $level = doc.resolve($level.before($level.depth - 1));
    }
  }

  // 빈 줄에서 Enter를 누르면 기본 동작은 들여쓰기 해제라 패널 밖으로 빠진다.
  // 목록은 자체 처리(문단으로 되돌리기)가 먼저 일어나므로 맡긴다.
  if (
    key === 'Enter' &&
    inPanel &&
    atStart &&
    blockContent.node.childCount === 0 &&
    contentType.spec.content === 'inline*' &&
    !contentType.name.endsWith('ListItem')
  ) {
    const { schema } = state;
    const block = schema.nodes.blockContainer.create(
      null,
      schema.nodes.paragraph.create(),
    );
    const tr = state.tr.insert(bnBlock.afterPos, block);
    tr.setSelection(TextSelection.create(tr.doc, bnBlock.afterPos + 2));
    view.dispatch(tr.scrollIntoView());
    return true;
  }

  return false;
}

export const tabsExtension = createExtension({
  key: 'tabsStructure',
  prosemirrorPlugins: [
    new Plugin({
      key: new PluginKey('tabsStructure'),
      appendTransaction(transactions, _oldState, newState) {
        if (!transactions.some((transaction) => transaction.docChanged)) {
          return null;
        }
        const tr = newState.tr;
        // 고칠 때마다 문서가 짧아지거나 채워지므로 금방 끝난다. 혹시 모를 무한 반복만 막는다.
        for (let attempt = 0; attempt < 32 && repairOnce(tr); attempt++);
        return tr.docChanged ? tr : null;
      },
      props: { handleKeyDown: handleBoundaryKey },
    }),
  ],
});
