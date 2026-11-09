import { useState } from 'react';
import type { TransitionEasing, TransitionSetting } from './transition';
import {
  DEFAULT_STEPS,
  DEFAULT_TRANSITION,
  MAX_DURATION,
  clampUnit,
} from './transition';

interface TransitionSettingsProps {
  value: TransitionSetting;
  onChange: (next: TransitionSetting) => void;
}

const DEFAULT_EASING: TransitionEasing =
  DEFAULT_TRANSITION.kind === 'smooth'
    ? DEFAULT_TRANSITION.easing
    : [0.25, 0.1, 0.25, 1.0];

const clampDuration = (value: number) =>
  Math.min(MAX_DURATION, Math.max(0, Math.round(value)));

// 공통 전환 설정 입력. 값의 저장은 호출한 쪽이 맡아, 어떤 블록에서든 그대로 쓴다.
export default function TransitionSettings({
  value,
  onChange,
}: TransitionSettingsProps) {
  const setEasing = (index: number, next: number) => {
    if (value.kind !== 'smooth') return;
    const easing: TransitionEasing = [...value.easing];
    easing[index] = next;
    onChange({ ...value, easing });
  };

  return (
    <div className="transition-settings">
      <div className="transition-kind" role="group" aria-label="전환 방식">
        <button
          type="button"
          aria-pressed={value.kind === 'smooth'}
          onClick={() => {
            if (value.kind === 'smooth') return;
            onChange({
              kind: 'smooth',
              duration: value.duration,
              easing: DEFAULT_EASING,
            });
          }}
        >
          부드럽게
        </button>
        <button
          type="button"
          aria-pressed={value.kind === 'steps'}
          onClick={() => {
            if (value.kind === 'steps') return;
            onChange({
              kind: 'steps',
              duration: value.duration,
              steps: DEFAULT_STEPS,
            });
          }}
        >
          계단식
        </button>
      </div>

      <NumberField
        label="시간(ms)"
        value={value.duration}
        min={0}
        max={MAX_DURATION}
        step={50}
        normalize={clampDuration}
        onCommit={(duration) => onChange({ ...value, duration })}
      />

      {value.kind === 'smooth' ? (
        <div className="transition-easing">
          {(['x1', 'y1', 'x2', 'y2'] as const).map((label, index) => (
            <NumberField
              key={label}
              label={label}
              value={value.easing[index]}
              step={0.05}
              // x는 0~1만 가능하고, y는 튀어 오르는 곡선을 위해 범위를 두지 않는다.
              {...(index % 2 === 0
                ? { min: 0, max: 1, normalize: clampUnit }
                : {})}
              onCommit={(next) => setEasing(index, next)}
            />
          ))}
        </div>
      ) : (
        <NumberField
          label="단계 수"
          value={value.steps}
          min={1}
          step={1}
          normalize={(next) => Math.max(1, Math.round(next))}
          onCommit={(steps) => onChange({ ...value, steps })}
        />
      )}
    </div>
  );
}

interface NumberFieldProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step: number;
  normalize?: (value: number) => number;
  onCommit: (value: number) => void;
}

// 입력 중에는 글자를 그대로 두어 "0."이나 빈칸처럼 숫자가 아닌 중간 상태를 허용한다.
function NumberField({
  label,
  value,
  min,
  max,
  step,
  normalize = (next) => next,
  onCommit,
}: NumberFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <label className="transition-field">
      <span>{label}</span>
      <input
        type="number"
        value={draft ?? String(value)}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          const text = event.target.value;
          setDraft(text);
          const parsed = Number(text);
          if (text.trim() === '' || !Number.isFinite(parsed)) return;
          const next = normalize(parsed);
          if (next !== value) onCommit(next);
        }}
        // 입력을 마치면 범위에 맞춰 고쳐진 실제 값을 보여 준다.
        onBlur={() => setDraft(null)}
      />
    </label>
  );
}
