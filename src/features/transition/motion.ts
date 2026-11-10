// 전환을 실제 화면에 걸 때 쓰는 DOM 도우미. 특정 블록을 알지 못한다.
import type { TransitionSetting } from './transition';
import { getTransitionDuration, toCssTiming } from './transition';

// 움직임 줄이기를 켠 사용자에게는 모든 전환을 즉시로 보여 준다.
export function prefersReducedMotion(): boolean {
  return (
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  );
}

// 화면에 실제로 움직임을 보여 줄지
export function shouldAnimate(setting: TransitionSetting): boolean {
  return getTransitionDuration(setting) > 0 && !prefersReducedMotion();
}

// Web Animations 시간 설정. 끝난 모습을 유지해(fill) 정리하는 쪽이 지울 때까지 튀지 않게 한다.
export function toAnimationTiming(
  setting: TransitionSetting,
): KeyframeAnimationOptions {
  return {
    duration: getTransitionDuration(setting),
    easing: toCssTiming(setting),
    fill: 'forwards',
  };
}

const alphaOf = (color: string) => {
  if (color === 'transparent') return 0;
  const match = /^rgba\((?:[^,]+,){3}\s*([\d.]+)\)$/.exec(color);
  return match ? Number(match[1]) : 1;
};

// 요소 뒤에 비치는 불투명한 배경색. 덮어 그리는 층이 바탕과 같은 색을 갖게 한다.
export function opaqueBackgroundBehind(element: Element): string {
  for (
    let current: Element | null = element;
    current;
    current = current.parentElement
  ) {
    const color = getComputedStyle(current).backgroundColor;
    if (alphaOf(color) >= 1) return color;
  }
  return 'Canvas';
}
