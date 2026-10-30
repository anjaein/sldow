import type { BlockNoteEditor } from '@blocknote/core';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/mantine/style.css';

interface DocumentEditorProps {
  editor: BlockNoteEditor;
}

export default function DocumentEditor({ editor }: DocumentEditorProps) {
  return <BlockNoteView editor={editor} theme="light" />;
}
