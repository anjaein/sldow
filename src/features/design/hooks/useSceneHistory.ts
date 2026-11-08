import { useCallback, useState } from 'react';
import type { Scene } from '../types';

const MAX_HISTORY = 100;

interface History {
  past: Scene[];
  present: Scene;
  future: Scene[];
}

// 편집 창의 장면과 되돌리기 기록. commit 한 번이 되돌리기 한 번이다.
export function useSceneHistory(initial: Scene) {
  const [history, setHistory] = useState<History>({
    past: [],
    present: initial,
    future: [],
  });

  const commit = useCallback((next: Scene) => {
    setHistory(({ past, present }) => ({
      past: [...past, present].slice(-MAX_HISTORY),
      present: next,
      future: [],
    }));
  }, []);

  const undo = useCallback(() => {
    setHistory((history) => {
      const previous = history.past.at(-1);
      if (!previous) return history;
      return {
        past: history.past.slice(0, -1),
        present: previous,
        future: [history.present, ...history.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory((history) => {
      const [next, ...future] = history.future;
      if (!next) return history;
      return {
        past: [...history.past, history.present],
        present: next,
        future,
      };
    });
  }, []);

  return { scene: history.present, commit, undo, redo };
}
