# sldow

필요한 기능들을 추가한 자체 블로그입니다

## 폴더 구조

```text
src/
├── api/          # 서버 API 요청 (백엔드 연결 시 사용)
├── assets/       # 이미지·아이콘·폰트 등 앱 정적 자산
├── components/   # 여러 기능에서 함께 쓰는 UI 컴포넌트
├── features/     # 기능 단위로 묶은 코드 (기능 안에서만 쓰는 컴포넌트·훅·저장소·타입)
│   └── document/
│       ├── components/
│       ├── hooks/
│       ├── storage.ts  # 로컬 폴더에 문서 파일 저장·조회
│       └── types.ts
├── pages/        # 라우팅에 연결되는 페이지 화면
├── hooks/        # 여러 기능에서 함께 쓰는 커스텀 React 훅
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
