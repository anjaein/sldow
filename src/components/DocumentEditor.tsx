import { ko } from '@blocknote/core/locales';
import { BlockNoteView } from '@blocknote/mantine';
import { useCreateBlockNote } from '@blocknote/react';
import '@blocknote/mantine/style.css';

interface DocumentEditorProps {
  paragraphs: string[];
}

export default function DocumentEditor({ paragraphs }: DocumentEditorProps) {
  const editor = useCreateBlockNote({
    dictionary: ko,
    domAttributes: {
      editor: { style: 'padding-inline: 0;' },
    },
    initialContent:
      paragraphs.length > 0
        ? paragraphs.map((content) => ({ type: 'paragraph' as const, content }))
        : undefined,
  });

  return <BlockNoteView editor={editor} theme="light" />;
}
