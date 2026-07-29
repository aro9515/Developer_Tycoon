# Developer Tycoon (MVP)

모바일 웹용 2D 개발사 타이쿤 — 세로 슬라이스 MVP.

## 스택

- Vite + Vue 3 + TypeScript + Pinia
- 게임 로직: `src/core` (Vue 비의존)
- 세이브: localStorage

## 실행

```bash
npm install
npm run dev
```

브라우저에서 안내된 주소로 접속하세요. 모바일 폭(430px) 기준으로 맞춰져 있습니다.

## MVP에서 할 수 있는 것

1. 시장에서 의뢰 수락 (착수금)
2. 플레이어를 프로젝트에 배치
3. 정상/스피드 모드
4. 시간 배속·일시정지
5. 완료 정산 (대성공~실패 + 잔금)
6. 기술부채(DP/Heat) 누적·주간 이자
7. 자동 세이브 / 이어하기
