import {
  filterSuggestionItems,
  insertOrUpdateBlockForSlashMenu,
} from '@blocknote/core/extensions';
import { BlockNoteView } from '@blocknote/mantine';
import {
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
} from '@blocknote/react';
import '@blocknote/mantine/style.css';
import type { DocumentEditor as Editor } from '../types';

interface DocumentEditorProps {
  editor: Editor;
}

export default function DocumentEditor({ editor }: DocumentEditorProps) {
  return (
    // 기본 슬래시 메뉴를 끄고, 디자인 블록을 더한 메뉴로 바꾼다.
    <BlockNoteView editor={editor} theme="light" slashMenu={false}>
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
  ];
}
