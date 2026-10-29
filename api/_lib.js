// 공용 도구 모음 (Supabase 연결, 한국 시간 계산, 팀 코드 확인, 팀즈 전송)
const SB_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const DEADLINE = process.env.DEADLINE || '11:25';
const [DL_H, DL_M] = DEADLINE.split(':').map(Number);
const DL_MIN = DL_H * 60 + DL_M;
const TZ = 'Asia/Seoul';
const ICON = { together: '🍚', solo: '🚶', away: '🏠' };
const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

async function sb(method, path, body, extra) {
  const headers = Object.assign({ apikey: SB_KEY, 'Content-Type': 'application/json' }, extra || {});
  if (SB_KEY.startsWith('eyJ')) headers.Authorization = 'Bearer ' + SB_KEY;
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  if (!r.ok) throw new Error(`supabase ${r.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}
const upsert = (table, conflict, rows) =>
  sb('POST', `${table}?on_conflict=${conflict}`, rows, { Prefer: 'resolution=merge-duplicates,return=minimal' });

function kstNow() {
  const o = {};
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short' })
    .formatToParts(new Date()).forEach(p => (o[p.type] = p.value));
  return { date: `${o.year}-${o.month}-${o.day}`, h: Number(o.hour) % 24, m: Number(o.minute), dow: WD[o.weekday] };
}
const dowOf = s => new Date(s + 'T00:00:00Z').getUTCDay();
function isLocked(date) {
  const n = kstNow();
  if (date < n.date) return true;
  return date === n.date && n.h * 60 + n.m >= DL_MIN;
}
function auth(req, res) {
  const code = process.env.TEAM_CODE;
  if (!code || !SB_URL || !SB_KEY) { res.status(500).json({ error: '서버 설정(환경변수)이 비어 있어요' }); return false; }
  if (req.headers['x-team-code'] !== code) { res.status(401).json({ error: '팀 코드가 맞지 않아요' }); return false; }
  return true;
}
function fail(res, e) { console.log('오류:', e.message); res.status(500).json({ error: '서버 오류가 발생했어요' }); }
function body(req) { return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); }

async function summary(date) {
  const members = await sb('GET', 'members?select=id,name&order=name');
  const rec = await sb('GET', 'recurring?select=member_id,dow');
  const ov = await sb('GET', `overrides?select=member_id,status&date=eq.${date}`);
  const g = { together: [], solo: [], away: [] };
  members.forEach(m => {
    const o = ov.find(x => x.member_id === m.id);
    const s = o ? o.status : rec.some(r => r.member_id === m.id && r.dow === dowOf(date)) ? 'solo' : 'together';
    g[s].push(m.name);
  });
  const [, mo, d] = date.split('-');
  const lines = [`${ICON.together} 오늘(${Number(mo)}/${Number(d)}) 점심은 ${g.together.length}명이 같이 먹어요.`];
  if (g.together.length) lines.push('같이: ' + g.together.join(', '));
  if (g.solo.length) lines.push(`${ICON.solo} 따로: ` + g.solo.join(', '));
  if (g.away.length) lines.push(`${ICON.away} 외근/휴가: ` + g.away.join(', '));
  return lines;
}
async function sendTeams(date) {
  const url = process.env.TEAMS_WEBHOOK_URL;
  if (!url) return { sent: false, reason: '팀즈 웹훅 주소가 비어 있어요' };
  const lines = await summary(date);
  const payload = { type: 'message', attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', content: {
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json', type: 'AdaptiveCard', version: '1.4',
    body: lines.map(t => ({ type: 'TextBlock', text: t, wrap: true })) } }] };
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  return { sent: r.ok, status: r.status };
}
module.exports = { sb, upsert, kstNow, dowOf, isLocked, auth, fail, body, sendTeams, DEADLINE, DL_MIN };
