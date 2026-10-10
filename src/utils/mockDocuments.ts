import type { DocumentPreview } from '../types/document';

const modules = import.meta.glob<DocumentPreview>('../mocks/[0-9]*.ts', {
  eager: true,
  import: 'default',
});

export const mockDocuments = Object.values(modules).sort((a, b) => a.id - b.id);
