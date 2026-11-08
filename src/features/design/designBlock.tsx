import { useMemo, useState } from 'react';
import { createReactBlockSpec } from '@blocknote/react';
import { EMPTY_SCENE, parseScene, serializeScene } from './types';
import ScenePreview from './components/ScenePreview';
import DesignEditorModal from './components/DesignEditorModal';

export const designBlock = createReactBlockSpec(
  {
    type: 'design',
    propSchema: { scene: { default: serializeScene(EMPTY_SCENE) } },
    content: 'none',
  },
  {
    render: function DesignBlock({ block, editor }) {
      const [editing, setEditing] = useState(false);
      const scene = useMemo(
        () => parseScene(block.props.scene),
        [block.props.scene],
      );

      return (
        <>
          <button
            type="button"
            className="design-block"
            onClick={() => setEditing(true)}
            aria-label="디자인 편집"
          >
            <ScenePreview scene={scene} />
          </button>
          {editing && (
            <DesignEditorModal
              scene={scene}
              onClose={(next) => {
                setEditing(false);
                // 바뀐 것이 없으면 문서를 건드리지 않아 자동 저장도 일어나지 않는다.
                if (next !== scene) {
                  editor.updateBlock(block, {
                    props: { scene: serializeScene(next) },
                  });
                }
              }}
            />
          )}
        </>
      );
    },
  },
);
