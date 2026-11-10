import {
  filterSuggestionItems,
  insertOrUpdateBlockForSlashMenu,
} from '@blocknote/core/extensions';
import { BlockNoteView } from '@blocknote/mantine';
import {
  FormattingToolbarController,
  getDefaultReactSlashMenuItems,
  SideMenuController,
  SuggestionMenuController,
} from '@blocknote/react';
import '@blocknote/mantine/style.css';
import BlockAwareFormattingToolbar from '../../selection/components/BlockAwareFormattingToolbar';
import BlockSideMenu from '../../selection/components/BlockSideMenu';
import {
  createTabsBlock,
  isInsideTabs,
  moveCursorToPanel,
} from '../../tabs/tabs';
import type { DocumentEditor as Editor } from '../types';

interface DocumentEditorProps {
  editor: Editor;
}

export default function DocumentEditor({ editor }: DocumentEditorProps) {
  return (
    // 기본 슬래시 메뉴를 끄고, 디자인 블록을 더한 메뉴로 바꾼다.
    // 블록 손잡이는 누르면 블록을 고르고, 블록을 고른 동안에는 글 서식 막대를 띄우지 않는다.
    <BlockNoteView
      editor={editor}
      theme="light"
      slashMenu={false}
      sideMenu={false}
      formattingToolbar={false}
    >
      <SideMenuController sideMenu={BlockSideMenu} />
      <FormattingToolbarController
        formattingToolbar={BlockAwareFormattingToolbar}
      />
      <SuggestionMenuController
        triggerCharacter="/"
        getItems={async (query) =>
          filterSuggestionItems(getSlashMenuItems(editor), query)
        }
      />
    </BlockNoteView>
  );
}

function getSlashMenuItems(editor: Editor) {
  return [
    ...getDefaultReactSlashMenuItems(editor),
    {
      title: '디자인',
      subtext: '도형과 선으로 그림 그리기',
      aliases: ['design', '도형', '다이어그램', '그림'],
      group: '디자인',
      onItemClick: () => {
        insertOrUpdateBlockForSlashMenu(editor, { type: 'design' });
      },
    },
    // 탭 안의 탭은 지원하지 않는다.
    ...(isInsideTabs(editor)
      ? []
      : [
          {
            title: '탭',
            subtext: '내용을 탭으로 나누어 보기',
            aliases: ['tabs', 'tab', '탭', '탭 블록'],
            group: '레이아웃',
            onItemClick: () => {
              const block = insertOrUpdateBlockForSlashMenu(
                editor,
                createTabsBlock(),
              );
              moveCursorToPanel(editor, block.children[0].id);
            },
          },
        ]),
  ];
}
