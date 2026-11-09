import { useEffect, useState } from 'react';
import { MantineProvider, Modal } from '@mantine/core';
import '@mantine/core/styles/ModalBase.layer.css';
import '@mantine/core/styles/Modal.layer.css';
import '@mantine/core/styles/Overlay.layer.css';
import type { Scene, Shape, StrokeStyle } from '../types';
import {
  PALETTE,
  findElement,
  removeElement,
  reorderElement,
  updateConnector,
  updateShape,
} from '../types';
import { useSceneHistory } from '../hooks/useSceneHistory';
import type { Tool } from './DesignCanvas';
import DesignCanvas from './DesignCanvas';
import InkSwatches from './InkSwatches';
import ShapeTitleInput from './ShapeTitleInput';
import ToolButton from './ToolButton';

const SHAPE_TYPES: { type: Shape['type']; label: string }[] = [
  { type: 'squircle', label: '둥근 박스' },
  { type: 'rect', label: '사각 박스' },
];

const STROKE_STYLES: { style: StrokeStyle; label: string }[] = [
  { style: 'solid', label: '실선' },
  { style: 'dashed', label: '파선' },
  { style: 'dotted', label: '점선' },
];

interface DesignEditorModalProps {
  scene: Scene;
  // 창을 닫을 때 편집한 장면을 넘긴다.
  onClose: (scene: Scene) => void;
}

// 화면 전체를 덮는 편집 창. 열릴 때마다 새로 마운트되어 저장된 장면에서 시작한다.
export default function DesignEditorModal({
  scene,
  onClose,
}: DesignEditorModalProps) {
  const { scene: draft, commit: setDraft, undo, redo } = useSceneHistory(scene);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('select');
  const selected = findElement(draft, 'shape', selectedId);
  const selectedConnector = findElement(draft, 'connector', selectedId);
  const hasSelection = draft.elements.some(({ id }) => id === selectedId);

  function reorder(edge: 'front' | 'back') {
    if (!selectedId) return;
    const next = reorderElement(draft, selectedId, edge);
    if (next !== draft) setDraft(next);
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // 글자를 입력하는 동안에는 입력칸의 기본 동작을 그대로 쓴다.
      const { target } = event;
      if (
        target instanceof HTMLInputElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      const modified = event.metaKey || event.ctrlKey;
      // 한글 입력 상태에서도 동작하도록 글자가 아니라 키 위치로 판단한다.
      if (modified && event.code === 'KeyZ') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (modified && event.code === 'KeyY') {
        event.preventDefault();
        redo();
      } else if (
        !modified &&
        (event.key === 'Delete' || event.key === 'Backspace') &&
        hasSelection
      ) {
        event.preventDefault();
        setDraft(removeElement(draft, selectedId!));
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [draft, hasSelection, selectedId, setDraft, undo, redo]);

  return (
    <MantineProvider>
      <Modal
        opened
        onClose={() => onClose(draft)}
        fullScreen
        withCloseButton={false}
        classNames={{
          content: 'design-modal-content',
          body: 'design-modal-body',
        }}
      >
        <div className="design-toolbar" role="toolbar" aria-label="디자인 도구">
          <ToolButton
            label="선택"
            active={tool === 'select'}
            onClick={() => setTool('select')}
          />
          <ToolButton
            label="도형"
            active={tool === 'shape'}
            onClick={() => setTool('shape')}
          />
          <ToolButton
            label="선"
            active={tool === 'line'}
            onClick={() => setTool('line')}
          />
          <ToolButton
            label="글자"
            active={tool === 'text'}
            onClick={() => setTool('text')}
          />
          {selectedConnector && (
            <div className="design-toolbar-group" aria-label="선 모양">
              <ToolButton
                label="직선"
                active={selectedConnector.path === 'straight'}
                onClick={() =>
                  setDraft(
                    updateConnector(draft, selectedConnector.id, {
                      path: 'straight',
                    }),
                  )
                }
              />
              <ToolButton
                label="곡선"
                active={selectedConnector.path === 'curve'}
                onClick={() =>
                  setDraft(
                    updateConnector(draft, selectedConnector.id, {
                      path: 'curve',
                    }),
                  )
                }
              />
              <ToolButton
                label="점선"
                active={selectedConnector.dashed}
                onClick={() =>
                  setDraft(
                    updateConnector(draft, selectedConnector.id, {
                      dashed: !selectedConnector.dashed,
                    }),
                  )
                }
              />
              <ToolButton
                label="화살표"
                active={selectedConnector.arrowEnd}
                onClick={() =>
                  setDraft(
                    updateConnector(draft, selectedConnector.id, {
                      arrowEnd: !selectedConnector.arrowEnd,
                    }),
                  )
                }
              />
            </div>
          )}
          {selected && (
            <div className="design-toolbar-group" aria-label="도형 모양">
              {SHAPE_TYPES.map(({ type, label }) => (
                <ToolButton
                  key={type}
                  label={label}
                  active={selected.type === type}
                  onClick={() =>
                    setDraft(updateShape(draft, selected.id, { type }))
                  }
                />
              ))}
            </div>
          )}
          {selected && (
            <div className="design-toolbar-group" aria-label="도형 색">
              <button
                type="button"
                className="design-swatch"
                style={{ background: '#ffffff' }}
                aria-label="색 없음"
                aria-pressed={selected.fill === null}
                onClick={() =>
                  setDraft(updateShape(draft, selected.id, { fill: null }))
                }
              />
              {PALETTE.map((color) => (
                <button
                  key={color}
                  type="button"
                  className="design-swatch"
                  style={{ background: color }}
                  aria-label={color}
                  aria-pressed={selected.fill === color}
                  onClick={() =>
                    setDraft(updateShape(draft, selected.id, { fill: color }))
                  }
                />
              ))}
            </div>
          )}
          {selected && (
            <>
              <InkSwatches
                label="테두리 색"
                value={selected.stroke}
                onPick={(stroke) =>
                  setDraft(updateShape(draft, selected.id, { stroke }))
                }
              />
              <div className="design-toolbar-group" aria-label="테두리 모양">
                {STROKE_STYLES.map(({ style, label }) => (
                  <ToolButton
                    key={style}
                    label={label}
                    active={selected.strokeStyle === style}
                    onClick={() =>
                      setDraft(
                        updateShape(draft, selected.id, { strokeStyle: style }),
                      )
                    }
                  />
                ))}
              </div>
              <div className="design-toolbar-group">
                <ShapeTitleInput
                  // 되돌리기로 제목이 바뀌어도 입력칸이 따라가게 한다.
                  key={`${selected.id}:${selected.title}`}
                  title={selected.title}
                  onCommit={(title) =>
                    setDraft(updateShape(draft, selected.id, { title }))
                  }
                />
              </div>
            </>
          )}
          {hasSelection && (
            <div className="design-toolbar-group" aria-label="겹침 순서">
              <ToolButton
                label="맨 앞으로"
                active={false}
                onClick={() => reorder('front')}
              />
              <ToolButton
                label="맨 뒤로"
                active={false}
                onClick={() => reorder('back')}
              />
            </div>
          )}
        </div>
        <button
          type="button"
          className="design-done"
          onClick={() => onClose(draft)}
        >
          완료
        </button>
        <DesignCanvas
          scene={draft}
          onChange={setDraft}
          selectedId={selectedId}
          onSelect={setSelectedId}
          tool={tool}
          onToolDone={() => setTool('select')}
        />
      </Modal>
    </MantineProvider>
  );
}
