import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import TransitionSettings from '../../transition/TransitionSettings';
import type { TransitionSetting } from '../../transition/transition';
import type { TabsPlacement } from '../tabs';
import { TABS_PLACEMENTS } from '../tabs';

const PLACEMENT_LABELS: Record<TabsPlacement, string> = {
  top: '위',
  bottom: '아래',
  left: '왼쪽',
  right: '오른쪽',
};

const POPOVER_WIDTH = 280;
const POPOVER_HEIGHT = 300;
const VIEWPORT_GAP = 8;

interface TabsSettingsPopoverProps {
  placement: TabsPlacement;
  transition: TransitionSetting;
  onPlacementChange: (placement: TabsPlacement) => void;
  onTransitionChange: (transition: TransitionSetting) => void;
}

export default function TabsSettingsPopover({
  placement,
  transition,
  onPlacementChange,
  onTransitionChange,
}: TabsSettingsPopoverProps) {
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(
    null,
  );
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const open = anchor !== null;

  useEffect(() => {
    if (!open) return;
    const close = () => setAnchor(null);
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !popoverRef.current?.contains(target) &&
        !buttonRef.current?.contains(target)
      ) {
        close();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.isComposing) close();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    // 고정 위치라서 문서가 스크롤되면 버튼과 어긋나므로 닫는다.
    window.addEventListener('scroll', close, { passive: true });
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', close);
    };
  }, [open]);

  const toggle = () => {
    if (open || !buttonRef.current) {
      setAnchor(null);
      return;
    }
    const rect = buttonRef.current.getBoundingClientRect();
    const fitsBelow =
      rect.bottom + POPOVER_HEIGHT + VIEWPORT_GAP < window.innerHeight;
    setAnchor({
      top: fitsBelow
        ? rect.bottom + VIEWPORT_GAP
        : Math.max(VIEWPORT_GAP, rect.top - POPOVER_HEIGHT - VIEWPORT_GAP),
      left: Math.min(
        Math.max(VIEWPORT_GAP, rect.right - POPOVER_WIDTH),
        window.innerWidth - POPOVER_WIDTH - VIEWPORT_GAP,
      ),
    });
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="tabs-icon-button"
        aria-label="탭 설정"
        aria-expanded={open}
        title="탭 설정"
        onMouseDown={(event) => event.preventDefault()}
        onClick={toggle}
      >
        ⚙
      </button>
      {anchor &&
        createPortal(
          <div
            ref={popoverRef}
            className="tabs-settings"
            style={{ ...anchor, width: POPOVER_WIDTH }}
          >
            <p className="tabs-settings-title">탭 막대 위치</p>
            <div
              className="tabs-placement"
              role="group"
              aria-label="탭 막대 위치"
            >
              {TABS_PLACEMENTS.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={option === placement}
                  onClick={() => onPlacementChange(option)}
                >
                  {PLACEMENT_LABELS[option]}
                </button>
              ))}
            </div>
            <p className="tabs-settings-title">전환</p>
            <TransitionSettings
              value={transition}
              onChange={onTransitionChange}
            />
          </div>,
          document.body,
        )}
    </>
  );
}
