import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { TextElement, TextRun } from '../types';
import { INK } from '../types';
import type { RunStyle } from '../text';
import {
  DEFAULT_RUN_STYLE,
  LINE_HEIGHT,
  TEXT_SIZES,
  formatRuns,
  getRunsLength,
  getStyleAt,
  getStyleOf,
  spliceRuns,
} from '../text';
import {
  getSelectionOffsets,
  readRuns,
  setSelectionOffsets,
  writeRuns,
} from '../textDom';
import { measureTextHeight } from '../measure';
import InkSwatches from './InkSwatches';
import ToolButton from './ToolButton';

const FORMAT_BAR_HEIGHT = 40;
const FORMAT_BAR_GAP = 8;
// 위쪽 툴바에 가리지 않는 서식 막대의 최소 위치
const FORMAT_BAR_MIN_TOP = 72;

interface TextEditorProps {
  text: TextElement;
  onFinish: (runs: TextRun[]) => void;
}

function getLastStyle(runs: TextRun[]): RunStyle {
  const last = runs.at(-1);
  return last ? getStyleOf(last) : DEFAULT_RUN_STYLE;
}

// 캔버스 위에서 자유 텍스트를 고치는 입력칸과 서식 막대.
export default function TextEditor({ text, onFinish }: TextEditorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  // 글자가 없거나 서식 없는 글자가 생겼을 때 쓸 서식
  const baseRef = useRef<RunStyle>(getLastStyle(text.runs));
  const composing = useRef(false);
  const [active, setActive] = useState<RunStyle>(() => getLastStyle(text.runs));
  const [height, setHeight] = useState(() =>
    Math.max(
      measureTextHeight(text),
      getLastStyle(text.runs).size * LINE_HEIGHT,
    ),
  );

  useLayoutEffect(() => {
    const root = rootRef.current!;
    writeRuns(root, text.runs, baseRef.current);
    root.focus();
    const end = getRunsLength(text.runs);
    setSelectionOffsets(root, end, end);
    // 처음 열 때의 내용만 쓴다. 이후에는 DOM이 입력 상태를 가진다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onSelectionChange = () => {
      const root = rootRef.current;
      if (!root || composing.current) return;
      const range = getSelectionOffsets(root);
      if (!range) return;
      const offset = range.end > range.start ? range.start + 1 : range.start;
      setActive(
        getStyleAt(readRuns(root, baseRef.current), offset, baseRef.current),
      );
    };
    document.addEventListener('selectionchange', onSelectionChange);
    return () =>
      document.removeEventListener('selectionchange', onSelectionChange);
  }, []);

  // 조각을 고쳐 DOM에 다시 쓴다. 조합 중에 DOM을 바꾸면 입력이 깨지므로 하지 않는다.
  function rewrite(
    change: (
      runs: TextRun[],
      start: number,
      end: number,
    ) => { runs: TextRun[]; start: number; end: number },
  ) {
    const root = rootRef.current;
    if (!root || composing.current) return;
    const range = getSelectionOffsets(root);
    if (!range) return;
    const result = change(
      readRuns(root, baseRef.current),
      range.start,
      range.end,
    );
    writeRuns(root, result.runs, baseRef.current);
    setSelectionOffsets(root, result.start, result.end);
    setHeight(root.offsetHeight);
  }

  function applyFormat(patch: Partial<RunStyle>) {
    rewrite((runs, start, end) => {
      // 고른 글자가 없으면 글자 전체에 적용하고, 이어서 입력할 글자에도 쓴다.
      const collapsed = start === end;
      if (collapsed) baseRef.current = { ...baseRef.current, ...patch };
      const next = collapsed
        ? formatRuns(runs, 0, getRunsLength(runs), patch)
        : formatRuns(runs, start, end, patch);
      const offset = end > start ? start + 1 : start;
      setActive({ ...getStyleAt(next, offset, baseRef.current) });
      return { runs: next, start, end };
    });
  }

  function insertText(inserted: string) {
    rewrite((runs, start, end) => {
      const offset = start + inserted.length;
      return {
        runs: spliceRuns(runs, start, end, inserted, baseRef.current),
        start: offset,
        end: offset,
      };
    });
  }

  const barTop =
    text.y - FORMAT_BAR_HEIGHT - FORMAT_BAR_GAP < FORMAT_BAR_MIN_TOP
      ? text.y + height + FORMAT_BAR_GAP
      : text.y - FORMAT_BAR_HEIGHT - FORMAT_BAR_GAP;

  return (
    <>
      <foreignObject x={text.x} y={text.y} width={text.w} height={height}>
        <div
          ref={rootRef}
          className="design-text design-text-editing"
          role="textbox"
          aria-multiline="true"
          aria-label="글자"
          contentEditable
          suppressContentEditableWarning
          // Esc가 편집 창까지 닫지 않게 Mantine에 알린다.
          data-mantine-stop-propagation="true"
          // 입력칸을 누른 것이 캔버스의 끌기로 이어지지 않게 한다.
          onPointerDown={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={() => {
            composing.current = false;
          }}
          onInput={(event) => setHeight(event.currentTarget.offsetHeight)}
          onBlur={(event) =>
            onFinish(readRuns(event.currentTarget, baseRef.current))
          }
          onPaste={(event) => {
            event.preventDefault();
            insertText(
              event.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n'),
            );
          }}
          onDrop={(event) => event.preventDefault()}
          onKeyDown={(event) => {
            // 한글 조합을 끝내는 Enter·Esc는 입력 종료로 보지 않는다.
            if (event.nativeEvent.isComposing || composing.current) return;
            const modified = event.metaKey || event.ctrlKey;
            if (event.key === 'Escape') {
              event.preventDefault();
              event.currentTarget.blur();
            } else if (event.key === 'Enter') {
              event.preventDefault();
              insertText('\n');
            } else if (modified && event.code === 'KeyB') {
              event.preventDefault();
              applyFormat({ bold: !active.bold });
            } else if (
              modified &&
              (event.code === 'KeyI' || event.code === 'KeyU')
            ) {
              // 브라우저가 멋대로 넣는 서식 태그를 막는다.
              event.preventDefault();
            }
          }}
          style={{ width: text.w }}
        />
      </foreignObject>
      {/* 캔버스 전체를 덮되 막대 자리만 누를 수 있게 해, 밖을 눌러 입력을 끝낼 수 있게 한다. */}
      <foreignObject
        x={0}
        y={0}
        width="100%"
        height="100%"
        pointerEvents="none"
      >
        <div
          className="design-format-bar"
          role="toolbar"
          aria-label="글자 서식"
          style={{
            left: `max(0px, min(${text.x}px, calc(100% - 30rem)))`,
            top: barTop,
          }}
          onPointerDown={(event) => event.stopPropagation()}
          // 입력칸의 포커스와 글자 선택을 유지한다.
          onMouseDown={(event) => event.preventDefault()}
        >
          <InkSwatches
            label="글자 색"
            value={active.color}
            onPick={(color) => applyFormat({ color })}
          />
          <div className="design-toolbar-group" aria-label="글자 크기">
            {TEXT_SIZES.map((size) => (
              <ToolButton
                key={size}
                label={String(size)}
                active={active.size === size}
                onClick={() => applyFormat({ size })}
              />
            ))}
          </div>
          <div className="design-toolbar-group">
            <ToolButton
              label="굵게"
              active={Boolean(active.bold)}
              onClick={() => applyFormat({ bold: !active.bold })}
            />
          </div>
          <div className="design-toolbar-group" aria-label="밑줄">
            {INK.map((color) => (
              <button
                key={color}
                type="button"
                className="design-tool"
                aria-label={`밑줄 ${color}`}
                aria-pressed={active.underline === color}
                style={{
                  textDecorationLine: 'underline',
                  textDecorationColor: color,
                  textDecorationThickness: 2,
                }}
                onClick={() =>
                  applyFormat({
                    underline: active.underline === color ? null : color,
                  })
                }
              >
                밑줄
              </button>
            ))}
          </div>
        </div>
      </foreignObject>
    </>
  );
}
