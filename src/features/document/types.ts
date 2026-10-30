import type { Block } from '@blocknote/core';

export interface DocumentPreview {
  id: number;
  title: string;
  blocks: Block[];
  linkedDocumentIds: number[];
}
