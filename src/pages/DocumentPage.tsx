import DocumentLayout from '../components/layout/DocumentLayout';
import DocumentRelations from '../components/DocumentRelations';
import { useLoaderData } from 'react-router';
import { mockDocuments } from '../utils/mockDocuments';
import { getDocument } from '../utils/getDocument';

export default function DocumentPage() {
  const { id, title, paragraphs, linkedDocumentIds } =
    useLoaderData<typeof getDocument>();

  return (
    <DocumentLayout
      title={title}
      relations={
        <DocumentRelations
          linkedDocumentIds={linkedDocumentIds}
          documents={mockDocuments}
        />
      }
    >
      {paragraphs.map((paragraph, index) => (
        <p key={`${id}-${index}`}>{paragraph}</p>
      ))}
    </DocumentLayout>
  );
}
