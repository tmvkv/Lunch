# 팀 점심 현황 (Vercel + Supabase)

- 화면: `public/index.html`
- API: `api/*.js` (Vercel Functions)
- 데이터: Supabase

## Vercel 환경변수 (Settings → Environment Variables)
| 이름 | 값 |
|---|---|
| SUPABASE_URL | Supabase 프로젝트 주소 (https://○○.supabase.co) |
| SUPABASE_SERVICE_KEY | Supabase의 secret(service_role) 키 — 비밀! |
| TEAM_CODE | 팀원들이 입력할 팀 코드 |
| CRON_SECRET | 알림 호출 보호용 아무 긴 문자열 (선택) |
| TEAMS_WEBHOOK_URL | 팀즈 Workflows 웹훅 주소 (선택) |
| DEADLINE | 변경 마감 시간, 기본 11:25 (선택) |

비밀 값은 코드나 GitHub에 올리지 말고 Vercel 환경변수에만 넣으세요.
