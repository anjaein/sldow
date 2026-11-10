import {
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { DocumentEditor } from '../../document/types';
import { shouldAnimate, toAnimationTiming } from '../../transition/motion';
import type { TransitionSetting } from '../../transition/transition';
import {
  INSTANT_TRANSITION,
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

// 부드러운 전환 하나. 전환 직전에 잰 패널 묶음의 높이를 기억한다.
interface PanelSwitch {
  fromHeight: number;
}

// 내용이 없는(content: 'none') 블록 중에도 글의 흐름에 속해 바로 바뀌는 것.
// 탭과 패널은 틀일 뿐이라 그 안의 블록을 각각 따진다.
const INSTANT_BLOCK_TYPES = new Set([
  'divider',
  'pageBreak',
  'tabs',
  'tabPanel',
]);

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const boxFrames = (box: Box) => ({
  transform: `translate(${box.x}px, ${box.y}px)`,
  width: `${box.width}px`,
  height: `${box.height}px`,
});

// 탭 블록의 패널 묶음과 그 안의 패널. 탭 막대에서 위로 올라가 찾는다.
function findGroup(from: Element | null): HTMLElement | null {
  return (
    from
      ?.closest('.bn-block')
      ?.querySelector<HTMLElement>(':scope > .bn-block-group') ?? null
  );
}

function findPanel(group: Element, id: string): HTMLElement | null {
  return group.querySelector<HTMLElement>(
    `:scope > .bn-block-outer[data-id="${CSS.escape(id)}"]`,
  );
}

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
    () => parseTransition(props.transition, INSTANT_TRANSITION),
    [props.transition],
  );

  // 어느 탭이 열려 있는지는 화면 상태라 저장하지 않는다. null이면 첫 탭이다.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [switching, setSwitching] = useState<PanelSwitch | null>(null);
  const [order, setOrder] = useState<string[] | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [resizing, setResizing] = useState<Partial<
    Record<ResizeTarget, number>
  > | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const indicatorState = useRef<{
    activeId: string | null;
    box: Box | null;
    slide: boolean;
    animation: Animation | null;
  }>({ activeId: null, box: null, slide: false, animation: null });
  const didDrag = useRef(false);

  const activeId = tabs.some((tab) => tab.id === selectedId)
    ? selectedId
    : (tabs[0]?.id ?? null);
  const fitsContent = (resizing?.height ?? height) === 0;

  // 전환 직전의 높이를 잰다. 즉시 전환이거나 잴 수 없으면 null이다.
  // 전환 중에 다시 누르면 움직이던 높이 그대로에서 이어 간다.
  const measureSwitch = (fromId: string | null): PanelSwitch | null => {
    if (!fromId || !shouldAnimate(transition)) return null;
    const group = findGroup(barRef.current);
    if (!group || group.getClientRects().length === 0) return null;
    return { fromHeight: group.getBoundingClientRect().height };
  };

  const show = (id: string) => {
    if (id === activeId) return;
    const next = measureSwitch(activeId);
    indicatorState.current.slide = next !== null;
    setSwitching(next);
    setSelectedId(id);
  };

  // 글이 있는 블록(문단, 제목, 목록, 인용, 코드, 표 등)은 흐리게 바뀌면 눈이 피로해 바로 바꾼다.
  // 이미지·디자인처럼 글이 없는 블록만 서서히 나타난다.
  const fadesIn = (type: string) => {
    const spec = (
      editor.schema.blockSchema as Record<string, { content: string }>
    )[type];
    return (
      spec !== undefined &&
      spec.content === 'none' &&
      !INSTANT_BLOCK_TYPES.has(type)
    );
  };

  // 부드러운 전환: 이전 패널은 바로 사라지고 새 패널의 글도 바로 보인다.
  // 글이 없는 블록만 서서히 나타나고, 패널 묶음의 높이는 같은 시간과 곡선으로 옮겨 간다.
  const startSwitch = useEffectEvent((current: PanelSwitch) => {
    const group = findGroup(barRef.current);
    const entering = activeId && group && findPanel(group, activeId);
    const animations: Animation[] = [];
    const timing = toAnimationTiming(transition);
    if (group && entering) {
      const toHeight = group.getBoundingClientRect().height;
      if (fitsContent && Math.abs(toHeight - current.fromHeight) >= 0.5) {
        // 묶음은 flex 항목이라 height만으로는 크기가 정해지지 않는다.
        // 최소·최대 높이를 함께 움직이면 막대 위치와 관계없이 높이가 고정된다.
        // 넘치는 내용은 그동안 잘라 낸다.
        const fixed = (value: number) => ({
          minHeight: `${value}px`,
          maxHeight: `${value}px`,
          overflow: 'hidden',
        });
        animations.push(
          group.animate([fixed(current.fromHeight), fixed(toHeight)], timing),
        );
      }
      entering
        .querySelectorAll<HTMLElement>('[data-content-type]')
        .forEach((content) => {
          if (fadesIn(content.dataset.contentType ?? '')) {
            animations.push(
              content.animate([{ opacity: 0 }, { opacity: 1 }], timing),
            );
          }
        });
    }

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setSwitching((latest) => (latest === current ? null : latest));
    };
    Promise.all(animations.map((animation) => animation.finished)).then(
      finish,
      () => {},
    );
    // 요소가 다시 그려져 애니메이션이 사라져도 전환 상태가 남지 않게 한다.
    const timer = setTimeout(finish, getTransitionDuration(transition) + 250);
    return () => {
      done = true;
      clearTimeout(timer);
      animations.forEach((animation) => animation.cancel());
    };
  });
  useLayoutEffect(() => {
    if (switching) return startSwitch(switching);
  }, [switching]);

  // 열린 탭 표시. 부드러운 전환에서는 이전 탭 자리에서 새 탭으로 미끄러진다.
  const placeIndicator = useEffectEvent(() => {
    const list = listRef.current;
    const indicator = indicatorRef.current;
    const state = indicatorState.current;
    const tab =
      activeId &&
      list?.querySelector<HTMLElement>(
        `[data-tab-id="${CSS.escape(activeId)}"]`,
      );
    if (!list || !indicator || !tab) return;

    const box: Box = {
      x: tab.offsetLeft,
      y: tab.offsetTop,
      width: tab.offsetWidth,
      height: tab.offsetHeight,
    };
    const slide =
      state.slide &&
      state.box !== null &&
      state.activeId !== null &&
      state.activeId !== activeId;
    state.slide = false;
    state.activeId = activeId;
    if (!slide && JSON.stringify(state.box) === JSON.stringify(box)) return;

    const running = state.animation?.playState === 'running';
    let from = state.box;
    if (slide && running) {
      // 움직이던 중에 다시 누르면 지금 보이는 자리에서 이어 간다.
      const rect = indicator.getBoundingClientRect();
      const listRect = list.getBoundingClientRect();
      from = {
        x: rect.left - listRect.left - list.clientLeft + list.scrollLeft,
        y: rect.top - listRect.top - list.clientTop + list.scrollTop,
        width: rect.width,
        height: rect.height,
      };
    }
    // 미끄러지는 중의 크기 변화는 도착 자리만 고친다.
    if (slide || !running) {
      state.animation?.cancel();
      state.animation = null;
    }
    state.box = box;
    Object.assign(indicator.style, boxFrames(box));
    if (slide && from) {
      state.animation = indicator.animate([boxFrames(from), boxFrames(box)], {
        ...toAnimationTiming(transition),
        fill: 'none',
      });
    }
  });
  useLayoutEffect(() => placeIndicator());
  // 이름 편집·글꼴 굵기 변화처럼 다시 그려지지 않는 크기 변화도 따라간다.
  const tabKey = tabs.map((tab) => tab.id).join(' ');
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const observer = new ResizeObserver(() => placeIndicator());
    observer.observe(list);
    list
      .querySelectorAll('[data-tab-id]')
      .forEach((tab) => observer.observe(tab));
    return () => observer.disconnect();
  }, [tabKey, placement]);

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
  });

  return (
    <div ref={barRef} className="tabs-bar" data-placement={placement}>
      <style>{css}</style>
      <div className="tabs-bar-inner">
        <div
          ref={listRef}
          className="tabs-list"
          role="tablist"
          aria-orientation={
            isVerticalBar(placement) ? 'vertical' : 'horizontal'
          }
        >
          <span
            ref={indicatorRef}
            className="tabs-indicator"
            aria-hidden="true"
          />
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
