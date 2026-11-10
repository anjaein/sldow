// 블록 손잡이를 누르면 노션처럼 그 블록을 고르고 블록 메뉴를 연다.
// BlockNote의 기본 손잡이(DragHandleButton)와 같고, 클릭 시 선택과 메뉴의 열림 제어만 더했다.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { getNodeById } from '@blocknote/core';
import { SideMenuExtension } from '@blocknote/core/extensions';
import {
  AddBlockButton,
  DragHandleMenu,
  SideMenu,
  useBlockNoteEditor,
  useComponentsContext,
  useDictionary,
  useExtension,
  useExtensionState,
  usePortalElement,
  type SideMenuProps,
} from '@blocknote/react';
import { Menu } from '@mantine/core';
import { selectBlockFromHandle } from '../blockSelectionExtension';

export default function BlockSideMenu(props: SideMenuProps) {
  return (
    <SideMenu {...props}>
      <AddBlockButton />
      <BlockDragHandle />
    </SideMenu>
  );
}

// 메뉴가 열려 있어도 고른 블록에 바로 쓰는 단축키. 키 이름은 한글 자판에서 달라지므로 자리(code)로도 본다.
function shortcutOf(event: KeyboardEvent): 'copy' | 'cut' | 'delete' | null {
  const mod = event.metaKey || event.ctrlKey;
  if (mod && !event.altKey && !event.shiftKey) {
    if (event.key.toLowerCase() === 'c' || event.code === 'KeyC') return 'copy';
    if (event.key.toLowerCase() === 'x' || event.code === 'KeyX') return 'cut';
  }
  if (!mod && !event.altKey && ['Delete', 'Backspace'].includes(event.key)) {
    return 'delete';
  }
  return null;
}

function BlockDragHandle() {
  const Components = useComponentsContext()!;
  const portalElement = usePortalElement();
  const dict = useDictionary();
  const editor = useBlockNoteEditor();
  const sideMenu = useExtension(SideMenuExtension);
  const block = useExtensionState(SideMenuExtension, {
    selector: (state) => state?.block,
  });
  const [opened, setOpened] = useState(false);
  // Shift+클릭은 고른 블록만 늘리고 메뉴는 열지 않는다.
  const skipToggle = useRef(false);

  const changeOpened = useCallback(
    (next: boolean) => {
      if (skipToggle.current) {
        skipToggle.current = false;
        return;
      }
      setOpened(next);
      if (next) {
        sideMenu.freezeMenu();
        return;
      }
      sideMenu.unfreezeMenu();
      // 메뉴가 가져간 포커스를 편집기로 돌려, 고른 블록에 바로 단축키를 쓸 수 있게 한다.
      // 메뉴 밖의 다른 입력란을 눌러 닫힌 경우는 그 입력란이 포커스를 가져가므로 그대로 둔다.
      const active = document.activeElement;
      if (
        !active ||
        active === document.body ||
        active.closest('.bn-drag-handle-menu, .bn-side-menu')
      ) {
        editor.focus();
      }
    },
    [editor, sideMenu],
  );

  useEffect(() => {
    if (!opened) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const shortcut = shortcutOf(event);
      if (!shortcut) return;
      event.preventDefault();
      event.stopPropagation();
      changeOpened(false);
      editor.focus();
      if (shortcut === 'delete') {
        const view = editor.prosemirrorView;
        view.dispatch(view.state.tr.deleteSelection());
      } else {
        // 포커스를 받은 편집기에서 복사 명령을 실행해 BlockNote의 복사 처리를 그대로 탄다.
        document.execCommand(shortcut);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [opened, changeOpened, editor]);

  if (block === undefined) return null;

  const onClick = (event: ReactMouseEvent) => {
    const view = editor.prosemirrorView;
    const info = getNodeById(block.id, view.state.doc);
    if (!info) return;
    selectBlockFromHandle(view, info.posBeforeNode, event.shiftKey);
    if (event.shiftKey) {
      skipToggle.current = true;
      editor.focus();
    }
  };

  return (
    <Menu
      opened={opened}
      onChange={changeOpened}
      withinPortal={!!portalElement}
      portalProps={portalElement ? { target: portalElement } : undefined}
      middlewares={{ flip: true, shift: true, inline: false, size: true }}
      position="left"
      returnFocus={false}
    >
      <Menu.Target>
        <Components.SideMenu.Button
          label={dict.side_menu.drag_handle_label}
          draggable={true}
          onClick={onClick}
          onDragStart={(event) => sideMenu.blockDragStart(event, block)}
          onDragEnd={() => sideMenu.blockDragEnd()}
          className="bn-button"
          icon={<DragIcon />}
        />
      </Menu.Target>
      <DragHandleMenu />
    </Menu>
  );
}

// BlockNote 기본 손잡이와 같은 점 여섯 개 모양
function DragIcon() {
  return (
    <svg
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      data-test="dragHandle"
    >
      <circle cx={9} cy={6} r={2} />
      <circle cx={15} cy={6} r={2} />
      <circle cx={9} cy={12} r={2} />
      <circle cx={15} cy={12} r={2} />
      <circle cx={9} cy={18} r={2} />
      <circle cx={15} cy={18} r={2} />
    </svg>
  );
}
