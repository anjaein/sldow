// 탭 블록의 데이터 다루기. 탭 블록의 자식은 tabPanel 블록이고, 그 자식이 실제 내용이다.
import { getNodeById } from '@blocknote/core';
import { Selection } from '@tiptap/pm/state';
import type { DocumentEditor } from '../document/types';

export const TABS_PLACEMENTS = ['top', 'bottom', 'left', 'right'] as const;
export type TabsPlacement = (typeof TABS_PLACEMENTS)[number];

export interface TabInfo {
  id: string;
  name: string;
}

// 시험판 크기 조절의 한계. 0은 내용에 맞춘 기본 크기를 뜻한다.
const BAR_SIZE_LIMITS = {
  horizontal: { min: 28, max: 120 },
  vertical: { min: 72, max: 320 },
};
const HEIGHT_LIMITS = { min: 120, max: 1200 };

export const isVerticalBar = (placement: TabsPlacement) =>
  placement === 'left' || placement === 'right';

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function clampBarSize(placement: TabsPlacement, size: number) {
  const { min, max } =
    BAR_SIZE_LIMITS[isVerticalBar(placement) ? 'vertical' : 'horizontal'];
  return clamp(size, min, max);
}

export const clampHeight = (height: number) =>
  clamp(height, HEIGHT_LIMITS.min, HEIGHT_LIMITS.max);

export function createPanel(name: string) {
  return {
    type: 'tabPanel' as const,
    props: { name },
    children: [{ type: 'paragraph' as const }],
  };
}

export function createTabsBlock() {
  return {
    type: 'tabs' as const,
    children: [createPanel('탭 1'), createPanel('탭 2')],
  };
}

export function readTabs(editor: DocumentEditor, tabsId: string): TabInfo[] {
  const children = editor.getBlock(tabsId)?.children ?? [];
  return children.flatMap((child) =>
    child.type === 'tabPanel' ? [{ id: child.id, name: child.props.name }] : [],
  );
}

// 커서가 이 탭 블록의 어느 패널 안에 있으면 그 패널의 id를 돌려준다.
export function panelAtSelection(
  editor: DocumentEditor,
  tabsId: string,
): string | null {
  const { $head } = editor.prosemirrorState.selection;
  for (let depth = $head.depth; depth >= 2; depth--) {
    const node = $head.node(depth);
    if (
      node.type.name === 'blockContainer' &&
      node.firstChild?.type.name === 'tabPanel' &&
      $head.node(depth - 2).attrs.id === tabsId
    ) {
      return node.attrs.id as string;
    }
  }
  return null;
}

export function moveCursorToPanel(editor: DocumentEditor, panelId: string) {
  const firstBlock = editor.getBlock(panelId)?.children[0];
  if (firstBlock) editor.setTextCursorPosition(firstBlock.id, 'start');
}

export function isInsideTabs(editor: DocumentEditor): boolean {
  let block: { id: string; type: string } | undefined =
    editor.getTextCursorPosition().block;
  while (block) {
    if (block.type === 'tabs' || block.type === 'tabPanel') return true;
    block = editor.getParentBlock(block.id);
  }
  return false;
}

// 탭 순서 변경. 커서가 옮긴 패널 안에 있어도 그대로 따라가게 하고,
// 전체를 다시 만드는 updateBlock과 달리 한 번의 되돌리기로 묶인다.
export function moveTab(
  editor: DocumentEditor,
  tabsId: string,
  panelId: string,
  toIndex: number,
) {
  editor.transact((tr) => {
    const tabs = getNodeById(tabsId, tr.doc);
    if (!tabs || tabs.node.childCount < 2) return;
    const group = tabs.node.lastChild!;
    // 패널들의 시작 위치: 블록 안(+1), 내용 노드 건너뜀, 자식 그룹 안(+1)
    let position = tabs.posBeforeNode + 1 + tabs.node.firstChild!.nodeSize + 1;
    const starts: number[] = [];
    group.forEach((panel) => {
      starts.push(position);
      position += panel.nodeSize;
    });

    const fromIndex = starts.findIndex(
      (_, index) => group.child(index).attrs.id === panelId,
    );
    if (fromIndex < 0 || fromIndex === toIndex) return;

    const from = starts[fromIndex];
    const panel = group.child(fromIndex);
    // 패널을 빼면 뒤쪽 위치가 당겨지므로, 뺀 뒤 기준의 위치로 바꾼다.
    const gap =
      toIndex > fromIndex
        ? starts[toIndex] + group.child(toIndex).nodeSize
        : starts[toIndex];
    const { head } = tr.selection;
    const cursorInside = head >= from && head <= from + panel.nodeSize;

    tr.delete(from, from + panel.nodeSize);
    const target = tr.mapping.map(gap);
    tr.insert(target, panel);
    if (cursorInside) {
      tr.setSelection(Selection.near(tr.doc.resolve(target + head - from)));
    }
  });
}

// 부드러운 전환 동안 아래에 깔려 있는 이전 패널. 위치는 전환 직전에 잰 값(묶음 기준 px)이다.
export interface LeavingPanel {
  id: string;
  top: number;
  left: number;
  width: number;
}

interface TabsCssOptions {
  tabsId: string;
  placement: TabsPlacement;
  barSize: number;
  height: number;
  activeId: string | null;
  leaving: LeavingPanel | null;
}

const FLEX_DIRECTION: Record<TabsPlacement, string> = {
  top: 'column',
  bottom: 'column-reverse',
  left: 'row',
  right: 'row-reverse',
};

// 어느 탭이 보이는지는 저장하지 않는 화면 상태다. 문서 노드를 건드리면 저장이 일어나고
// ProseMirror가 DOM 변경을 되돌리므로, 블록별 스타일로만 패널을 숨긴다.
// 움직임(투명도·높이)은 DOM을 바꾸지 않는 Web Animations로 따로 건다.
export function buildTabsCss({
  tabsId,
  placement,
  barSize,
  height,
  activeId,
  leaving,
}: TabsCssOptions): string {
  const block = `.bn-block[data-id="${CSS.escape(tabsId)}"]`;
  const group = `${block} > .bn-block-group`;
  const panel = `${group} > .bn-block-outer`;
  const panelWithId = (id: string) => `${panel}[data-id="${CSS.escape(id)}"]`;
  const barBasis =
    barSize > 0 ? `${barSize}px` : isVerticalBar(placement) ? '9rem' : 'auto';

  const rules = [
    `${block} { flex-direction: ${FLEX_DIRECTION[placement]}; }`,
    `${block} > .react-renderer { flex: 0 0 ${barBasis}; }`,
  ];

  if (height > 0) {
    rules.push(
      `${block} { height: ${height}px; }`,
      `${group} { flex: 1 1 0; min-height: 0; overflow-y: auto; }`,
    );
  }

  if (activeId) {
    const shown = [activeId, leaving?.id ?? null].filter((id) => id !== null);
    const hidden = shown
      .map((id) => `:not([data-id="${CSS.escape(id)}"])`)
      .join('');
    rules.push(`${panel}${hidden} { display: none; }`);
  }

  if (activeId && leaving) {
    // 이전 패널은 자리를 그대로 지키며 불투명하게 남고, 새 패널이 그 위에 덮인다.
    // 둘이 함께 반투명해지지 않으므로 사이로 배경이 비치지 않는다.
    rules.push(
      `${panelWithId(leaving.id)} { position: absolute; top: ${leaving.top}px; left: ${leaving.left}px; width: ${leaving.width}px; margin: 0; pointer-events: none; }`,
      `${panelWithId(activeId)} { position: relative; z-index: 1; }`,
    );
    // 높이가 내용에 맞춰질 때는 높이를 움직이므로, 넘치는 쪽을 잘라 낸다.
    if (height === 0) rules.push(`${group} { overflow: hidden; }`);
  }

  return rules.join('\n');
}
