import type { Scene } from '../types';
import { getSceneBounds } from '../geometry';
import SceneView from './SceneView';

// 선 두께와 화살표가 잘리지 않게 둘레에 남기는 여백
const PADDING = 16;

// 문서 본문에 보이는 미리보기. 격자 없이 장면 크기에 딱 맞춰 그린다.
export default function ScenePreview({ scene }: { scene: Scene }) {
  const bounds = getSceneBounds(scene);
  if (!bounds) {
    return <p className="design-preview-empty">디자인 — 눌러서 편집</p>;
  }

  const width = bounds.w + PADDING * 2;
  const height = bounds.h + PADDING * 2;
  return (
    <svg
      className="design-preview"
      viewBox={`${bounds.x - PADDING} ${bounds.y - PADDING} ${width} ${height}`}
      // 장면보다 넓게 늘이지 않고, 본문보다 넓으면 줄인다.
      style={{ width, maxWidth: '100%', height: 'auto' }}
    >
      <SceneView scene={scene} />
    </svg>
  );
}
