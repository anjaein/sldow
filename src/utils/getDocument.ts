import type { DocumentPreview } from '../types/document';
import { mockDocuments } from './mockDocuments';

export function getDocument(id: string | number | undefined): DocumentPreview {
  if (id === undefined || String(id).trim() === '') {
    throw new Response(null, { status: 404 });
  }

  const documentId = Number(id);
  if (!Number.isSafeInteger(documentId) || documentId < 0) {
    throw new Response(null, { status: 404 });
  }

  return (
    mockDocuments.find((document) => document.id === documentId) ?? {
      id: documentId,
      title: '',
      paragraphs: [],
      linkedDocumentIds: [],
    }
  );
}
