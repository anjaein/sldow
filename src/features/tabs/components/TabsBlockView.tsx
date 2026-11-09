import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { DocumentEditor } from '../../document/types';
import type { TransitionSetting } from '../../transition/transition';
import {
  getTransitionDuration,
  parseTransition,
  serializeTransition,
} from '../../transition/transition';
import type { TabInfo, TabsPlacement } from '../tabs';
import {
  buildTabsCss,
  clampBarSize,
  clampHeight,
  createPanel,
  isVerticalBar,
  moveCursorToPanel,
  moveTab,
  panelAtSelection,
  readTabs,
} from '../tabs';
import TabItem from './TabItem';
import TabsSettingsPopover from './TabsSettingsPopover';

interface TabsBlockViewProps {
  tabsId: string;
  props: {
    placement: TabsPlacement;
    barSize: number;
    height: number;
    transition: string;
  };
  editor: DocumentEditor;
}

type ResizeTarget = 'barSize' | 'height';

// 패널 이름은 자식 블록에 있어, 탭 블록의 노드 뷰는 이름이 바뀌어도 다시 그려지지 않는다.
// 문서 변경을 직접 구독해 읽는다.
function useTabs(editor: DocumentEditor, tabsId: string): TabInfo[] {
  const subscribe = useCallback(
    (onChange: () => void) => editor.onChange(onChange),
    [editor],
  );
  const snapshot = useSyncExternalStore(subscribe, () =>
    JSON.stringify(readTabs(editor, tabsId)),
  );
  return useMemo(() => JSON.parse(snapshot) as TabInfo[], [snapshot]);
}

export default function TabsBlockView({
  tabsId,
  props,
  editor,
}: TabsBlockViewProps) {
  const { placement, barSize, height } = props;
  const tabs = useTabs(editor, tabsId);
  const transition = useMemo(
    () => parseTransition(props.transition),
    [props.transition],
  );
  const duration = getTransitionDuration(transition);

  // 어느 탭이 열려 있는지는 화면 상태라 저장하지 않는다. null이면 첫 탭이다.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [leavingId, setLeavingId] = useState<string | null>(null);
  const [order, setOrder] = useState<string[] | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [resizing, setResizing] = useState<Partial<
    Record<ResizeTarget, number>
  > | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const didDrag = useRef(false);

  const activeId = tabs.some((tab) => tab.id === selectedId)
    ? selectedId
    : (tabs[0]?.id ?? null);

  useEffect(() => {
    if (!leavingId) return;
    const timer = setTimeout(() => setLeavingId(null), duration);
    return () => clearTimeout(timer);
  }, [leavingId, duration]);

  const show = (id: string) => {
    if (id === activeId) return;
    setLeavingId(duration > 0 ? activeId : null);
    setSelectedId(id);
  };

  // 탭을 눌러 패널을 바꿀 때 커서가 이 탭 블록 안에 있었다면 새 패널로 함께 옮긴다.
  const selectTab = (id: string) => {
    const cursorPanel = panelAtSelection(editor, tabsId);
    if (cursorPanel && cursorPanel !== id) moveCursorToPanel(editor, id);
    show(id);
  };

  // 되돌리기 등으로 커서가 숨겨진 패널에 들어가면 그 탭을 열어, 보이지 않는 입력을 막는다.
  const followCursor = useEffectEvent(() => {
    const { selection } = editor.prosemirrorState;
    if (!selection.empty && !('node' in selection)) return;
    const panelId = panelAtSelection(editor, tabsId);
    if (panelId && panelId !== activeId) show(panelId);
  });
  useEffect(() => editor.onSelectionChange(followCursor), [editor]);

  const addTab = () => {
    const last = tabs[tabs.length - 1];
    if (!last) return;
    const [panel] = editor.insertBlocks(
      [createPanel(`탭 ${tabs.length + 1}`)],
      last.id,
      'after',
    );
    show(panel.id);
    moveCursorToPanel(editor, panel.id);
    editor.focus();
  };

  const deleteTab = (id: string) => {
    if (tabs.length <= 1) return;
    if (id === activeId) {
      const index = tabs.findIndex((tab) => tab.id === id);
      selectTab(tabs[index + 1]?.id ?? tabs[index - 1].id);
    }
    editor.removeBlocks([id]);
  };

  const renameTab = (id: string, name: string) => {
    editor.updateBlock(id, { props: { name } });
  };

  const updateProps = (next: Partial<TabsBlockViewProps['props']>) => {
    editor.updateBlock(tabsId, { props: next });
  };

  const changePlacement = (next: TabsPlacement) => {
    if (next === placement) return;
    // 가로 막대와 세로 막대는 두께 기준이 달라 방향이 바뀌면 기본 두께로 돌아간다.
    updateProps(
      isVerticalBar(next) === isVerticalBar(placement)
        ? { placement: next }
        : { placement: next, barSize: 0 },
    );
  };

  const changeTransition = (next: TransitionSetting) => {
    const serialized = serializeTransition(next);
    if (serialized !== props.transition) {
      updateProps({ transition: serialized });
    }
  };

  // 탭 순서 변경. ProseMirror가 먼저 받는 HTML 드래그 대신 포인터 이벤트로 처리한다.
  const startTabDrag = (event: ReactPointerEvent, id: string) => {
    if (event.button !== 0) return;
    didDrag.current = false;
    const { clientX: startX, clientY: startY } = event;
    const vertical = isVerticalBar(placement);
    const others = tabs.filter((tab) => tab.id !== id).map((tab) => tab.id);
    let nextOrder: string[] | null = null;

    const onMove = (move: PointerEvent) => {
      if (
        !didDrag.current &&
        Math.hypot(move.clientX - startX, move.clientY - startY) < 4
      ) {
        return;
      }
      didDrag.current = true;
      setDraggingId(id);

      const pointer = vertical ? move.clientY : move.clientX;
      const index = others.filter((otherId) => {
        const element = barRef.current?.querySelector(
          `[data-tab-id="${CSS.escape(otherId)}"]`,
        );
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        const center = vertical
          ? rect.top + rect.height / 2
          : rect.left + rect.width / 2;
        return center < pointer;
      }).length;
      nextOrder = [...others.slice(0, index), id, ...others.slice(index)];
      setOrder(nextOrder);
    };

    const stop = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', stop);
      setDraggingId(null);
      setOrder(null);
    };

    const onUp = () => {
      stop();
      if (nextOrder) moveTab(editor, tabsId, id, nextOrder.indexOf(id));
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', stop);
  };

  // 시험판 크기 조절. 끄는 동안은 화면에만 반영하고, 놓을 때 한 번만 저장한다.
  const startResize = (event: ReactPointerEvent, target: ResizeTarget) => {
    event.preventDefault();
    const blockElement = event.currentTarget.closest('.bn-block');
    const barElement = blockElement?.querySelector(':scope > .react-renderer');
    if (!blockElement || !barElement) return;

    const vertical = isVerticalBar(placement);
    const useY = target === 'height' || !vertical;
    const sign =
      target === 'barSize' && (placement === 'bottom' || placement === 'right')
        ? -1
        : 1;
    const start = useY ? event.clientY : event.clientX;
    const startRect = (
      target === 'height' ? blockElement : barElement
    ).getBoundingClientRect();
    const startSize = useY ? startRect.height : startRect.width;
    let latest: number | null = null;

    const onMove = (move: PointerEvent) => {
      const delta = (useY ? move.clientY : move.clientX) - start;
      const size = Math.round(startSize + sign * delta);
      latest =
        target === 'height' ? clampHeight(size) : clampBarSize(placement, size);
      setResizing({ [target]: latest });
    };

    const stop = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', stop);
      setResizing(null);
    };

    const onUp = () => {
      stop();
      if (latest !== null && latest !== props[target]) {
        updateProps({ [target]: latest });
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', stop);
  };

  const orderedTabs = order
    ? order.flatMap((id) => tabs.filter((tab) => tab.id === id))
    : tabs;

  const css = buildTabsCss({
    tabsId,
    placement,
    barSize: resizing?.barSize ?? barSize,
    height: resizing?.height ?? height,
    activeId,
    leavingId,
    duration,
    transition,
  });

  return (
    <div ref={barRef} className="tabs-bar" data-placement={placement}>
      <style>{css}</style>
      <div className="tabs-bar-inner">
        <div
          className="tabs-list"
          role="tablist"
          aria-orientation={
            isVerticalBar(placement) ? 'vertical' : 'horizontal'
          }
        >
          {orderedTabs.map((tab) => (
            <TabItem
              key={tab.id}
              tab={tab}
              active={tab.id === activeId}
              dragging={tab.id === draggingId}
              canDelete={tabs.length > 1}
              onSelect={() => {
                if (!didDrag.current) selectTab(tab.id);
              }}
              onPointerDown={(event) => startTabDrag(event, tab.id)}
              onRename={(name) => renameTab(tab.id, name)}
              onDelete={() => deleteTab(tab.id)}
            />
          ))}
        </div>

        <div className="tabs-actions">
          <button
            type="button"
            className="tabs-icon-button"
            aria-label="탭 추가"
            title="탭 추가"
            // 눌러도 에디터의 포커스를 뺏지 않는다.
            onMouseDown={(event) => event.preventDefault()}
            onClick={addTab}
          >
            +
          </button>
          <TabsSettingsPopover
            placement={placement}
            transition={transition}
            onPlacementChange={changePlacement}
            onTransitionChange={changeTransition}
          />
        </div>

        <button
          type="button"
          tabIndex={-1}
          className="tabs-bar-resize"
          aria-label="탭 막대 두께 조절"
          title="끌어서 두께 조절, 두 번 눌러 기본값"
          onPointerDown={(event) => startResize(event, 'barSize')}
          onDoubleClick={() => updateProps({ barSize: 0 })}
        />
      </div>
      <button
        type="button"
        tabIndex={-1}
        className="tabs-height-resize"
        aria-label="탭 블록 높이 조절"
        title="끌어서 높이 조절, 두 번 눌러 내용에 맞춤"
        onPointerDown={(event) => startResize(event, 'height')}
        onDoubleClick={() => updateProps({ height: 0 })}
      />
    </div>
  );
}
