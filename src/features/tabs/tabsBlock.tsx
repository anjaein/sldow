import { createReactBlockSpec } from '@blocknote/react';
import type { DocumentEditor } from '../document/types';
import {
  INSTANT_TRANSITION,
  serializeTransition,
} from '../transition/transition';
import TabsBlockView from './components/TabsBlockView';
import { TABS_PLACEMENTS } from './tabs';
import { tabsExtension } from './tabsExtension';

export const tabsBlock = createReactBlockSpec(
  {
    type: 'tabs',
    propSchema: {
      placement: { default: 'top', values: TABS_PLACEMENTS },
      // 시험판 크기 조절 값(px). 0이면 기본 크기를 쓴다.
      barSize: { default: 0 },
      height: { default: 0 },
      // 탭 전환의 기본은 노션처럼 즉시 바뀌는 것이다.
      transition: { default: serializeTransition(INSTANT_TRANSITION) },
    },
    content: 'none',
  },
  {
    render: function TabsBlock({ block, editor }) {
      return (
        <TabsBlockView
          tabsId={block.id}
          props={block.props}
          editor={editor as unknown as DocumentEditor}
        />
      );
    },
    // 복사한 HTML과 텍스트에는 탭 막대를 넣지 않는다. 패널 내용은 자식 블록으로 따라간다.
    toExternalHTML: () => <div />,
  },
  [tabsExtension],
);

export const tabPanelBlock = createReactBlockSpec(
  {
    type: 'tabPanel',
    propSchema: { name: { default: '탭' } },
    content: 'none',
  },
  {
    // 숨겨진 패널 자체가 방향키로 선택되면 커서가 보이지 않는 곳에 머문다.
    meta: { selectable: false },
    // 패널의 모습은 탭 블록이 그린다. 이 블록은 이름과 자식만 가진다.
    render: () => <div />,
    toExternalHTML: ({ block }) => <p>{block.props.name}</p>,
  },
);
