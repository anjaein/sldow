import { useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import type { TabInfo } from '../tabs';

interface TabItemProps {
  tab: TabInfo;
  active: boolean;
  dragging: boolean;
  canDelete: boolean;
  onSelect: () => void;
  onPointerDown: (event: PointerEvent) => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}

export default function TabItem({
  tab,
  active,
  dragging,
  canDelete,
  onSelect,
  onPointerDown,
  onRename,
  onDelete,
}: TabItemProps) {
  const [editing, setEditing] = useState(false);
  const cancelled = useRef(false);

  return (
    <div
      className="tabs-tab"
      data-tab-id={tab.id}
      data-active={active || undefined}
      data-dragging={dragging || undefined}
    >
      {editing ? (
        <input
          className="tabs-tab-input"
          aria-label="탭 이름"
          defaultValue={tab.name}
          autoFocus
          onFocus={(event) => event.target.select()}
          onBlur={(event) => {
            const name = event.target.value.trim();
            setEditing(false);
            if (cancelled.current) {
              cancelled.current = false;
            } else if (name && name !== tab.name) {
              onRename(name);
            }
          }}
          onKeyDown={(event) => {
            // 한글 조합을 끝내는 Enter·Esc는 입력 종료로 보지 않는다. Safari는 229로만 알려 준다.
            if (event.nativeEvent.isComposing || event.keyCode === 229) return;
            if (event.key === 'Escape') cancelled.current = true;
            if (event.key === 'Enter' || event.key === 'Escape') {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
        />
      ) : (
        <button
          type="button"
          role="tab"
          aria-selected={active}
          className="tabs-tab-name"
          title="두 번 눌러 이름 변경"
          // 탭을 눌러도 에디터의 포커스를 뺏지 않아 이어서 입력할 수 있다.
          onMouseDown={(event) => event.preventDefault()}
          onPointerDown={onPointerDown}
          onClick={onSelect}
          onDoubleClick={() => setEditing(true)}
        >
          {tab.name}
        </button>
      )}
      {canDelete && !editing && (
        <button
          type="button"
          className="tabs-tab-delete"
          aria-label={`${tab.name} 삭제`}
          title="탭 삭제"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onDelete}
        >
          ×
        </button>
      )}
    </div>
  );
}
