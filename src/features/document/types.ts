import type { schema } from './hooks/useDocumentEditor';

export type DocumentBlock = typeof schema.Block;
export type DocumentEditor = typeof schema.BlockNoteEditor;

export interface DocumentPreview {
  id: number;
  title: string;
  blocks: DocumentBlock[];
  linkedDocumentIds: number[];
}
