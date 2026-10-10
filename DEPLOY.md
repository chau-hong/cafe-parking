# 배포 방법 (처음 한 번만 하면 됩니다)

준비물: Cloudflare 계정(무료), GitHub 계정(무료), 컴퓨터에 Node.js(터미널에서 `node -v` 로 확인, 없으면 nodejs.org 에서 LTS 설치).
아래 터미널 명령은 모두 `~/Documents/starbucks_parking` 폴더에서 시작합니다.

## 1. 데이터와 화면 파일 만들기
```
python3 export_app.py          # 이미 했다면 생략
python3 export_server.py       # site/worker/src/data.json 과 site/docs/index.html 생성
```
처음에는 `site/config.json` 이 새로 만들어졌다고 나옵니다. 지금은 그대로 두세요(3번에서 고칩니다).

## 2. 조회 API(Worker) 올리기
```
cd site/worker
npx wrangler login             # 브라우저가 열리면 Cloudflare 로그인 후 허용
npx wrangler deploy
```
끝에 `https://cafe-parking-api.내계정.workers.dev` 같은 주소가 나옵니다. 브라우저에서 그 주소 뒤에 `/api/meta` 를 붙여 열었을 때 글자가 잔뜩 나오면 성공입니다.

## 3. 화면에 API 주소 넣기
`site/config.json` 의 `api_base` 를 위 주소로 고치고(끝에 `/api/...` 붙이지 않음) 다시:
```
cd ../..
python3 export_server.py
```

## 4. GitHub 로 화면 공개하기
1. GitHub 에서 새 저장소를 만듭니다(예: `cafe-parking`, Public).
2. 터미널에서:
```
cd site
git init
git add .
git status                     # 목록에 worker/src/data.json 이 "없어야" 합니다. 있으면 멈추고 알려 주세요.
git commit -m "first"
git branch -M main
git remote add origin https://github.com/내아이디/cafe-parking.git
git push -u origin main
```
3. 저장소 Settings → Pages → Branch: `main`, 폴더 `/docs` 선택 → Save. 몇 분 뒤 `https://내아이디.github.io/cafe-parking/` 가 열립니다.

## 5. 다른 사이트에서 API 를 못 쓰게 잠그기
`site/worker/wrangler.toml` 의 `ALLOWED_ORIGIN = ""` 를 `ALLOWED_ORIGIN = "https://내아이디.github.io"` 로 고치고(경로 없이 도메인만):
```
cd worker
npx wrangler deploy
```
(이건 브라우저에서 다른 사이트가 가져다 쓰는 걸 막는 보조 장치입니다. 프로그램으로 직접 호출하는 건 아래 6번 설정과 요청 횟수 제한이 줄여 줍니다.)

## 6. (권장) Cloudflare 요청 제한 켜기
Cloudflare 대시보드 → 내 Worker 도메인(또는 Security → WAF) → Rate limiting rules 에서 `/api/` 경로에 IP당 분당 요청 횟수 제한 규칙을 하나 만드세요(무료 플랜은 규칙 수·조건이 제한적일 수 있습니다). Worker 안에도 분당 45회 제한이 있지만 이건 서버 인스턴스별 보조 장치입니다.

## 매주 데이터 갱신할 때
"스벅주차"로 데이터를 갱신·승인한 뒤:
```
python3 export_app.py && python3 export_server.py
cd site/worker && npx wrangler deploy
```
화면(`docs/index.html`)은 데이터가 없어서 바뀌지 않으니 GitHub 에 다시 올릴 필요가 없습니다(화면을 고쳤을 때만 push).

## 알아둘 점
- Cloudflare 무료 플랜 Worker 는 하루 10만 요청까지 무료입니다. 사용자가 많아지면 유료 플랜이 필요할 수 있습니다.
- GitHub 저장소에는 `worker/src/data.json` 이 올라가지 않도록 `.gitignore` 가 막고 있습니다. 이 파일을 직접 올리면 데이터가 공개됩니다.
- 각 브랜드 사이트에서 가져온 정보이므로, 공개 서비스로 운영하기 전에 각 사이트의 이용약관·데이터 이용 조건을 확인하세요.
