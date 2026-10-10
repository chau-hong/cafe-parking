# 주차되는 카페 — 서버 조회 버전

수도권 스타벅스·커피빈·투썸플레이스의 주차 조건을 동네별로 비교하는 앱입니다.

- `docs/index.html` : 화면(GitHub Pages 로 공개). **매장 데이터가 들어 있지 않고**, 필요한 동네만 API 로 조회합니다.
- `worker/` : 조회 API(Cloudflare Worker). 데이터(`worker/src/data.json`)는 이 안에만 있고 GitHub 에는 올라가지 않습니다.
- 한 번에 최대 30곳, 한 검색에서 최대 300곳까지만 내려주고, 같은 IP 에서 분당 45회를 넘으면 잠시 막습니다.

배포 방법은 `DEPLOY.md` 를 보세요.
