import { useCallback, useEffect, useState } from 'react';
import { BlockNoteSchema } from '@blocknote/core';
import { ko } from '@blocknote/core/locales';
import { useCreateBlockNote } from '@blocknote/react';
import type { DocumentPreview } from '../types';
import { saveDocument } from '../storage';
import { useAutoSave } from '../../../hooks/useAutoSave';
import { useSaveShortcut } from '../../../hooks/useSaveShortcut';
import { designBlock } from '../../design/designBlock';
import { tabPanelBlock, tabsBlock } from '../../tabs/tabsBlock';

// 기본 블록에 디자인 블록을 더한 문서 스키마
export const schema = BlockNoteSchema.create().extend({
  blockSpecs: {
    design: designBlock(),
    tabs: tabsBlock(),
    tabPanel: tabPanelBlock(),
  },
});

export function useDocumentEditor(document: DocumentPreview) {
  const editor = useCreateBlockNote({
    schema,
    dictionary: ko,
    domAttributes: { editor: { style: 'padding-inline: 0;' } },
    // 빈 배열이면 undefined로 넘겨 에디터의 기본 빈 블록을 사용한다.
    initialContent: document.blocks.length > 0 ? document.blocks : undefined,
  });
  const [title, setTitle] = useState(document.title);

  const save = useCallback(
    () => saveDocument({ ...document, title, blocks: editor.document }),
    [document, title, editor],
  );
  const { schedule, flush, error } = useAutoSave(save);
  // 자동 저장과 단축키 저장이 같은 저장 함수를 쓴다.
  useSaveShortcut(flush);
  useEffect(() => editor.onChange(schedule), [editor, schedule]);

  const onTitleChange = useCallback(
    (title: string) => {
      setTitle(title);
      schedule();
    },
    [schedule],
  );

  return { editor, onTitleChange, error };
}
