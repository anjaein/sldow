/**
 * 자동 저장: schedule 호출 시 기존 타이머를 취소하고 delay(기본 300ms) 후 저장한다.
 * 즉시 저장: flush 호출 시 대기 중인 타이머를 취소하고 save를 실행한다.
 * 종료 처리: 언마운트 시 미저장 변경이 있으면 flush를 호출한다.
 * 오류 처리: 최신 저장 요청의 오류 메시지를 error로 반환한다.
 */
import { useCallback, useEffect, useReducer, useRef } from 'react';

type SaveState = {
  attempt: number;
  error: string;
};

type SaveAction =
  | { type: 'start'; attempt: number }
  | { type: 'success'; attempt: number }
  | { type: 'failure'; attempt: number; error: string };

function saveReducer(state: SaveState, action: SaveAction): SaveState {
  switch (action.type) {
    // 최신 저장 요청 번호 기록
    case 'start':
      return { ...state, attempt: action.attempt };
    // 저장 성공: 오류 메시지 제거
    case 'success':
      if (action.attempt !== state.attempt) return state;
      return { ...state, error: '' };
    // 저장 실패: 오류 메시지 보관
    case 'failure':
      if (action.attempt !== state.attempt) return state;
      return { ...state, error: action.error };
  }
}

export function useAutoSave(save: () => Promise<void>, delay = 300) {
  const saveRef = useRef(save);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // 편집할 때 changed를 올리고, 저장 성공 시 저장 시작 때의 변경 번호를 saved에 기록한다.
  // changed > saved이면 저장하지 않은 변경이 남아 있어, 언마운트 시 저장한다.
  // 저장을 시도할 때 attempt를 올려, 이전 요청의 결과가 최신 오류 상태를 덮지 않게 한다.
  // 화면 표시용 값이 아니므로 ref에 보관하고, 값이 바뀌어도 다시 렌더링하지 않는다.
  const progress = useRef({ changed: 0, saved: 0, attempt: 0 });
  const [state, dispatch] = useReducer(saveReducer, {
    attempt: 0,
    error: '',
  });

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  // 예약된 저장을 취소하고 현재 내용을 바로 저장한다.
  // 성공하면 저장 시작 때의 변경 번호를 기록하고, 실패하면 오류를 전달한다.
  // 단축키 저장, 예약된 자동 저장, 언마운트 시 미저장 변경 처리에 사용한다.
  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    timer.current = undefined;
    const version = progress.current.changed;
    const attempt = ++progress.current.attempt;
    dispatch({ type: 'start', attempt });
    try {
      await saveRef.current();
      // 저장 중 발생한 새 변경까지 저장 완료로 처리하지 않는다.
      progress.current.saved = Math.max(progress.current.saved, version);
      dispatch({
        type: 'success',
        attempt,
      });
    } catch (error) {
      // 이전 요청의 결과가 최신 요청의 오류 상태를 덮지 않게 한다.
      dispatch({
        type: 'failure',
        attempt,
        error:
          error instanceof Error
            ? error.message
            : '문서를 저장하지 못했습니다.',
      });
    }
  }, []);

  // 편집 사실을 기록하고 delay(기본 300ms) 뒤에 flush를 실행하도록 예약한다.
  // 그전에 다시 편집하면 기존 예약을 취소하고 시간을 다시 센다.
  const schedule = useCallback(() => {
    progress.current.changed += 1;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), delay);
  }, [delay, flush]);

  useEffect(() => {
    const state = progress.current;
    return () => {
      clearTimeout(timer.current);
      if (state.changed > state.saved) void flush();
    };
  }, [flush]);

  return { schedule, flush, error: state.error };
}
