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
