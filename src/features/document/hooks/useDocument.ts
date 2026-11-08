import { useEffect, useState } from 'react';
import type { DocumentPreview } from '../types';
import { connectDirectory, findDocument, restoreDirectory } from '../storage';

export type DocumentState =
  | { status: 'loading' }
  | { status: 'disconnected'; connect: () => void; error: string }
  | { status: 'not-found' }
  | { status: 'error'; message: string }
  | { status: 'ready'; document: DocumentPreview };

type FindResult = { document: DocumentPreview | null } | { error: string };

function parseDocumentId(id: string | undefined): number | null {
  if (id === undefined || !/^\d+$/.test(id)) return null;
  const documentId = Number(id);
  return Number.isSafeInteger(documentId) ? documentId : null;
}

export function useDocument(id: string | undefined): DocumentState {
  const documentId = parseDocumentId(id);
  // 이전 연결을 되살리는 중이면 undefined, 결과가 나오면 연결 여부를 들고 있는다.
  const [isReady, setIsReady] = useState<boolean>();
  const [connectError, setConnectError] = useState('');
  const [result, setResult] = useState<FindResult>();

  useEffect(() => {
    if (documentId === null) return;
    let ignore = false;
    restoreDirectory().then(
      (restored) => {
        if (!ignore) setIsReady(restored);
      },
      (error) => {
        if (ignore) return;
        // 되살리기에 실패해도 버튼으로 다시 연결할 수 있게 한다.
        setIsReady(false);
        setConnectError(
          error instanceof Error
            ? error.message
            : '저장 폴더 연결을 확인하지 못했습니다.',
        );
      },
    );
    return () => {
      ignore = true;
    };
  }, [documentId]);

  useEffect(() => {
    if (documentId === null || !isReady) return;
    let ignore = false;
    findDocument(documentId).then(
      (document) => {
        if (!ignore) setResult({ document });
      },
      (error) => {
        if (!ignore) {
          setResult({
            error:
              error instanceof Error
                ? error.message
                : '문서를 불러오지 못했습니다.',
          });
        }
      },
    );
    return () => {
      ignore = true;
    };
  }, [documentId, isReady]);

  async function connect() {
    setConnectError('');
    try {
      await connectDirectory();
      setIsReady(true);
    } catch (error) {
      // 사용자가 폴더 선택을 취소한 경우는 오류로 보지 않는다.
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setConnectError(
        error instanceof Error
          ? error.message
          : '저장 폴더를 연결하지 못했습니다.',
      );
    }
  }

  if (documentId === null) return { status: 'not-found' };
  if (isReady === undefined) return { status: 'loading' };
  if (!isReady) {
    return {
      status: 'disconnected',
      connect: () => void connect(),
      error: connectError,
    };
  }
  if (!result) return { status: 'loading' };
  if ('error' in result) return { status: 'error', message: result.error };
  if (!result.document) return { status: 'not-found' };
  return { status: 'ready', document: result.document };
}
