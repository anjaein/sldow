import { useParams } from 'react-router';
import DocumentLayout from '../features/document/components/DocumentLayout';
import DocumentEditor from '../features/document/components/DocumentEditor';
import DocumentTitle from '../features/document/components/DocumentTitle';
import NotFoundPage from './NotFoundPage';
import type { DocumentPreview } from '../features/document/types';
import { useDocument } from '../features/document/hooks/useDocument';
import { useDocumentEditor } from '../features/document/hooks/useDocumentEditor';

export default function DocumentPage() {
  const { id } = useParams();
  // 문서가 바뀌면 불러오기 상태와 에디터를 새로 만든다.
  return <DocumentLoader key={id} id={id} />;
}

function DocumentLoader({ id }: { id: string | undefined }) {
  const state = useDocument(id);

  switch (state.status) {
    case 'loading':
      return null;
    case 'not-found':
      return <NotFoundPage />;
    case 'disconnected':
      return (
        <>
          <button
            type="button"
            style={{ all: 'revert' }}
            onClick={state.connect}
          >
            저장 폴더 연결
          </button>
          {state.error && <p role="alert">{state.error}</p>}
        </>
      );
    case 'error':
      return <p role="alert">{state.message}</p>;
    case 'ready':
      return <DocumentContent document={state.document} />;
  }
}

function DocumentContent({ document }: { document: DocumentPreview }) {
  const { editor, onTitleChange, error } = useDocumentEditor(document);

  return (
    <DocumentLayout
      title={<DocumentTitle title={document.title} onChange={onTitleChange} />}
      relations={null}
    >
      <DocumentEditor editor={editor} />
      {error && <p role="alert">{error}</p>}
    </DocumentLayout>
  );
}
