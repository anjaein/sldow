// 블록을 통째로 고른 동안에는 글 서식 도구 막대를 숨긴다.
// BlockNote는 비어 있지 않은 선택이면 막대를 띄워, 고른 블록 위를 가린다. 노션처럼 블록 선택에는 띄우지 않는다.
import {
  FormattingToolbar,
  useEditorState,
  type FormattingToolbarProps,
} from '@blocknote/react';
import { blockSelectionRange } from '../blockSelection';

export default function BlockAwareFormattingToolbar(
  props: FormattingToolbarProps,
) {
  const blockSelected = useEditorState({
    on: 'selection',
    selector: ({ editor }) =>
      blockSelectionRange(editor.prosemirrorState.selection) !== null,
  });
  return blockSelected ? null : <FormattingToolbar {...props} />;
}
