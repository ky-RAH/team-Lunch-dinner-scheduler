# Team Dinner Scheduler

팀원 투표 데이터를 모아서 자동 편성과 팀별 회식비 관리까지 할 수 있는 정적 웹앱입니다.

## 현재 상태

- UI와 자동편성, 회식비/영수증 관리 로직은 구현되어 있습니다.
- 실제 공용 데이터 저장은 `Supabase` 연결이 필요합니다.
- `config.js`가 비어 있으면 브라우저 로컬 임시 모드로 동작합니다.

## 로컬 실행

```bash
python3 -m http.server 4173
```

브라우저에서 `http://localhost:4173` 로 접속합니다.

## 실사용 설정

1. Supabase에서 새 프로젝트 생성
2. SQL Editor에서 [supabase-schema.sql](/Users/kyrah/ky-project/supabase-schema.sql) 실행
3. Project URL과 anon key 확인
4. [config.js](/Users/kyrah/ky-project/config.js)에 값 입력

예시:

```js
window.APP_CONFIG = {
  supabaseUrl: "https://YOUR_PROJECT.supabase.co",
  supabaseAnonKey: "YOUR_SUPABASE_ANON_KEY",
  supabaseTable: "team_scheduler_state",
};
```

## 배포

GitHub Pages로 배포 가능하며, `config.js`가 채워져 있으면 모든 팀원이 같은 데이터를 공유합니다.
