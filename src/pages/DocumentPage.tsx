import DocumentLayout from '../components/layout/DocumentLayout';
import DocumentRelations from '../components/DocumentRelations';
import DocumentEditor from '../components/DocumentEditor';
import DocumentTitle from '../components/DocumentTitle';
import { useLoaderData } from 'react-router';
import { mockDocuments } from '../utils/mockDocuments';
import { getDocument } from '../utils/getDocument';

export default function DocumentPage() {
  const { id, title, paragraphs, linkedDocumentIds } =
    useLoaderData<typeof getDocument>();

  return (
    <DocumentLayout
      title={<DocumentTitle key={id} title={title} />}
      relations={
        <DocumentRelations
          linkedDocumentIds={linkedDocumentIds}
          documents={mockDocuments}
        />
      }
    >
      <DocumentEditor key={id} paragraphs={paragraphs} />
    </DocumentLayout>
  );
}
