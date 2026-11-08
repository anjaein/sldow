import { useState } from 'react';
import type { DocumentPreview } from '../types';
import { connectDirectory, saveDocument } from '../storage';

let lastId = 0;

function createEmptyDocument(): DocumentPreview {
  // 같은 밀리초에 여러 번 만들어도 ID가 겹치지 않게 한다.
  lastId = Math.max(Date.now(), lastId + 1);
  return { id: lastId, title: '', blocks: [], linkedDocumentIds: [] };
}

export function useCreateDocument() {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState('');

  async function createDocument(): Promise<DocumentPreview | null> {
    setIsPending(true);
    setError('');
    try {
      // 폴더 선택 창은 클릭 안에서만 열 수 있어 생성 직전에 연결한다.
      await connectDirectory();
      const document = createEmptyDocument();
      await saveDocument(document);
      return document;
    } catch (error) {
      // 사용자가 폴더 선택을 취소한 경우는 오류로 보지 않는다.
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setError(
          error instanceof Error ? error.message : '문서를 만들지 못했습니다.',
        );
      }
      return null;
    } finally {
      setIsPending(false);
    }
  }

  return { createDocument, isPending, error };
}
