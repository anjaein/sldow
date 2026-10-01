# sldow

필요한 기능들을 추가한 자체 블로그입니다

## 폴더 구조

```text
src/
├── api/          # 서버 API 요청 (백엔드 연결 시 사용)
├── assets/       # 이미지·아이콘·폰트 등 앱 정적 자산
├── components/   # UI 컴포넌트 (필요에 따라 기능별 하위 폴더)
├── pages/        # 라우팅에 연결되는 페이지 화면
├── hooks/        # 커스텀 React 훅
├── mocks/        # 개발·검증용 가상 데이터와 응답
├── stores/       # 공유 상태와 상태 관리 로직
├── styles/       # Tailwind 진입점 및 전역 스타일
│   └── global.css
├── types/        # 여러 파일에서 공유하는 TypeScript 타입
├── utils/        # React에 의존하지 않는 공통 함수
├── App.tsx      # 앱 루트 컴포넌트
├── main.tsx     # React 실행 진입점
└── vite-env.d.ts

docs/            # 저장소 사용·운영 관련 문서
```
