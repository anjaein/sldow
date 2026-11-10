// 화면 전환의 공통 설정. 탭뿐 아니라 이후 애니메이션 블록도 같은 값을 쓰므로
// 특정 블록을 알지 못하는 평범한 JSON 값과 순수 함수로만 둔다.
export type TransitionEasing = [number, number, number, number];

// 즉시: 노션처럼 중간 단계 없이 바로 바뀐다. 부드럽게: 시간과 곡선을 따라 바뀐다.
export type TransitionSetting =
  | { kind: 'instant' }
  | { kind: 'smooth'; duration: number; easing: TransitionEasing };

export const INSTANT_TRANSITION: TransitionSetting = { kind: 'instant' };

// '부드럽게'를 처음 고를 때의 값
export const DEFAULT_TRANSITION: TransitionSetting = {
  kind: 'smooth',
  duration: 300,
  easing: [0.25, 0.1, 0.25, 1.0],
};

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

// 저장된 값을 읽는다. 문자열(JSON)과 객체를 모두 받고, 깨진 값은 fallback으로 읽는다.
// 기본값은 쓰는 블록마다 다를 수 있어(탭은 즉시) 호출한 쪽이 정한다.
export function parseTransition(
  value: unknown,
  fallback: TransitionSetting = DEFAULT_TRANSITION,
): TransitionSetting {
  const raw = typeof value === 'string' ? readJson(value) : value;
  if (typeof raw !== 'object' || raw === null) return fallback;

  const { kind, duration, easing } = raw as Record<string, unknown>;
  // 예전의 '계단식'(steps)은 없어졌다. 뚝뚝 끊기는 전환 대신 즉시로 읽는다.
  if (kind === 'instant' || kind === 'steps') return INSTANT_TRANSITION;
  if (kind !== 'smooth') return fallback;

  if (
    !isFiniteNumber(duration) ||
    duration < 0 ||
    !Array.isArray(easing) ||
    easing.length !== 4 ||
    !easing.every(isFiniteNumber)
  ) {
    return fallback;
  }
  const [x1, y1, x2, y2] = easing as TransitionEasing;
  return {
    kind,
    duration: Math.min(MAX_DURATION, duration),
    easing: [clampUnit(x1), y1, clampUnit(x2), y2],
  };
}

export function serializeTransition(setting: TransitionSetting): string {
  return JSON.stringify(setting);
}

// 실제로 걸리는 시간(ms). 0이면 즉시 전환으로 다룬다.
export function getTransitionDuration(setting: TransitionSetting): number {
  return setting.kind === 'smooth' ? setting.duration : 0;
}

// CSS와 Web Animations의 easing 문자열
export function toCssTiming(setting: TransitionSetting): string {
  if (setting.kind !== 'smooth') return 'linear';
  const [x1, y1, x2, y2] = setting.easing;
  return `cubic-bezier(${clampUnit(x1)}, ${y1}, ${clampUnit(x2)}, ${y2})`;
}
