// 화면 전환의 공통 설정. 탭뿐 아니라 이후 애니메이션 블록도 같은 값을 쓰므로
// 특정 블록을 알지 못하는 평범한 JSON 값과 순수 함수로만 둔다.
export type TransitionEasing = [number, number, number, number];

export type TransitionSetting =
  | { kind: 'smooth'; duration: number; easing: TransitionEasing }
  | { kind: 'steps'; duration: number; steps: number };

export const DEFAULT_TRANSITION: TransitionSetting = {
  kind: 'smooth',
  duration: 300,
  easing: [0.25, 0.1, 0.25, 1.0],
};

export const DEFAULT_STEPS = 4;
export const MAX_DURATION = 10000;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

// CSS cubic-bezier는 x가 0~1을 벗어나면 규칙 전체가 무효가 된다.
export const clampUnit = (value: number) => Math.min(1, Math.max(0, value));

function readJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

// 저장된 값을 읽는다. 문자열(JSON)과 객체를 모두 받고, 깨진 값은 기본값으로 읽는다.
export function parseTransition(value: unknown): TransitionSetting {
  const raw = typeof value === 'string' ? readJson(value) : value;
  if (typeof raw !== 'object' || raw === null) return DEFAULT_TRANSITION;

  const { kind, duration, easing, steps } = raw as Record<string, unknown>;
  if (!isFiniteNumber(duration) || duration < 0) return DEFAULT_TRANSITION;

  if (kind === 'smooth') {
    if (
      !Array.isArray(easing) ||
      easing.length !== 4 ||
      !easing.every(isFiniteNumber)
    ) {
      return DEFAULT_TRANSITION;
    }
    const [x1, y1, x2, y2] = easing as TransitionEasing;
    return {
      kind,
      duration,
      easing: [clampUnit(x1), y1, clampUnit(x2), y2],
    };
  }

  if (kind === 'steps' && Number.isInteger(steps) && (steps as number) >= 1) {
    return { kind, duration, steps: steps as number };
  }

  return DEFAULT_TRANSITION;
}

export function serializeTransition(setting: TransitionSetting): string {
  return JSON.stringify(setting);
}

// CSS의 steps(1)은 기본이 end라서 시간을 다 기다린 뒤에야 바뀐다.
// 한 단계는 즉시 전환이므로 시작 지점에서 뛰게 하고, 시간도 0으로 본다.
const isInstant = (setting: TransitionSetting) =>
  setting.kind === 'steps' && setting.steps === 1;

// 실제로 걸리는 시간(ms)
export function getTransitionDuration(setting: TransitionSetting): number {
  return isInstant(setting) ? 0 : setting.duration;
}

export function toCssTiming(setting: TransitionSetting): string {
  if (setting.kind === 'steps') {
    return `steps(${setting.steps}, ${isInstant(setting) ? 'start' : 'end'})`;
  }
  const [x1, y1, x2, y2] = setting.easing;
  return `cubic-bezier(${clampUnit(x1)}, ${y1}, ${clampUnit(x2)}, ${y2})`;
}
