// 팀 점심 현황 서버 (외부 패키지 없이 Node.js 기본 기능만 사용)
const http = require('http'), fs = require('fs'), path = require('path');
const { DatabaseSync } = require('node:sqlite');
// 설정 파일: config.json이 있으면 그것을, 없으면 config.example.json을 사용해요.
// 팀 코드와 팀즈 주소는 환경변수(TEAM_CODE, TEAMS_WEBHOOK_URL)로도 지정할 수 있어요.
const cfgPath = ['config.json', 'config.example.json'].map(f => path.join(__dirname, f)).find(f => fs.existsSync(f));
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
if (process.env.TEAM_CODE) cfg.teamCode = process.env.TEAM_CODE;
if (process.env.TEAMS_WEBHOOK_URL) cfg.teamsWebhookUrl = process.env.TEAMS_WEBHOOK_URL;
const PORT = process.env.PORT || cfg.port || 3000;
const TZ = 'Asia/Seoul';
const [DL_H, DL_M] = String(cfg.deadline || '11:25').split(':').map(Number);
const DL_MIN = DL_H * 60 + DL_M;
const STATUSES = ['together', 'solo', 'away'];
const ICON = { together: '🍚', solo: '🚶', away: '🏠' };

const db = new DatabaseSync(path.join(__dirname, 'lunch.db'));
db.exec(`
CREATE TABLE IF NOT EXISTS members(id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS recurring(member_id INTEGER NOT NULL, dow INTEGER NOT NULL, PRIMARY KEY(member_id, dow));
CREATE TABLE IF NOT EXISTS overrides(member_id INTEGER NOT NULL, date TEXT NOT NULL, status TEXT NOT NULL, PRIMARY KEY(member_id, date));
CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS menus(date TEXT PRIMARY KEY, text TEXT NOT NULL);
`);
(cfg.members || []).forEach(n => db.prepare('INSERT OR IGNORE INTO members(name) VALUES(?)').run(n));

const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
function kstNow() {
  const o = {};
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short' })
    .formatToParts(new Date()).forEach(p => o[p.type] = p.value);
  return { date: `${o.year}-${o.month}-${o.day}`, h: Number(o.hour) % 24, m: Number(o.minute), dow: WD[o.weekday] };
}
const dowOf = s => new Date(s + 'T00:00:00Z').getUTCDay();
function isLocked(date) {
  const n = kstNow();
  if (date < n.date) return true;
  return date === n.date && n.h * 60 + n.m >= DL_MIN;
}
function statusFor(memberId, date) {
  const o = db.prepare('SELECT status FROM overrides WHERE member_id=? AND date=?').get(memberId, date);
  if (o) return o.status;
  const r = db.prepare('SELECT 1 AS x FROM recurring WHERE member_id=? AND dow=?').get(memberId, dowOf(date));
  return r ? 'solo' : 'together';
}

function summary(date) {
  const g = { together: [], solo: [], away: [] };
  db.prepare('SELECT id,name FROM members ORDER BY name').all().forEach(m => g[statusFor(m.id, date)].push(m.name));
  const [, mo, d] = date.split('-');
  const lines = [`${ICON.together} 오늘(${Number(mo)}/${Number(d)}) 점심은 ${g.together.length}명이 같이 먹어요.`];
  if (g.together.length) lines.push('같이: ' + g.together.join(', '));
  if (g.solo.length) lines.push(`${ICON.solo} 따로: ` + g.solo.join(', '));
  if (g.away.length) lines.push(`${ICON.away} 외근/휴가: ` + g.away.join(', '));
  return lines;
}
async function sendTeams() {
  if (!cfg.teamsWebhookUrl) { console.log('팀즈 웹훅 주소가 비어 있어 알림을 건너뛰어요.'); return false; }
  const body = { type: 'message', attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', content: {
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json', type: 'AdaptiveCard', version: '1.4',
    body: summary(kstNow().date).map(t => ({ type: 'TextBlock', text: t, wrap: true })) } }] };
  const res = await fetch(cfg.teamsWebhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  console.log('팀즈 전송 결과:', res.status);
  return res.ok;
}
setInterval(() => {
  const n = kstNow(), t = n.h * 60 + n.m;
  if (n.dow < 1 || n.dow > 5 || t < DL_MIN || t >= DL_MIN + 10) return;
  const sent = db.prepare("SELECT v FROM meta WHERE k='notified'").get();
  if (sent && sent.v === n.date) return;
  db.prepare("INSERT OR REPLACE INTO meta(k,v) VALUES('notified',?)").run(n.date);
  sendTeams().catch(e => console.log('팀즈 전송 실패:', e.message));
}, 20000);

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((ok, no) => {
    let s = '';
    req.on('data', c => { s += c; if (s.length > 10000) { no(new Error('too large')); req.destroy(); } });
    req.on('end', () => { try { ok(JSON.parse(s || '{}')); } catch (e) { no(e); } });
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = req.url.split('?')[0];
    if (req.method === 'GET' && (url === '/' || url === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(fs.readFileSync(path.join(__dirname, 'public', 'index.html')));
    }
    if (!url.startsWith('/api/')) return send(res, 404, { error: '없는 주소예요' });
    if (cfg.teamCode && req.headers['x-team-code'] !== cfg.teamCode) return send(res, 401, { error: '팀 코드가 맞지 않아요' });

    if (req.method === 'GET' && url === '/api/state') {
      const n = kstNow();
      const from = new Date(n.date + 'T00:00:00Z'); from.setUTCDate(from.getUTCDate() - 8);
      return send(res, 200, {
        members: db.prepare('SELECT id,name FROM members ORDER BY name').all(),
        recurring: db.prepare('SELECT member_id,dow FROM recurring').all(),
        overrides: db.prepare('SELECT member_id,date,status FROM overrides WHERE date>=?').all(from.toISOString().slice(0, 10)),
        menu: (db.prepare('SELECT text FROM menus WHERE date=?').get(n.date) || { text: '' }).text,
        today: n.date, h: n.h, m: n.m, deadline: `${String(DL_H).padStart(2, '0')}:${String(DL_M).padStart(2, '0')}`, locked: isLocked(n.date)
      });
    }
    if (req.method === 'POST' && url === '/api/status') {
      const b = await readBody(req);
      const mem = db.prepare('SELECT id FROM members WHERE id=?').get(Number(b.memberId));
      if (!mem) return send(res, 400, { error: '팀원을 찾을 수 없어요' });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date) || isNaN(Date.parse(b.date))) return send(res, 400, { error: '날짜가 올바르지 않아요' });
      if (!STATUSES.includes(b.status)) return send(res, 400, { error: '상태가 올바르지 않아요' });
      if (isLocked(b.date)) return send(res, 403, { error: '마감되었거나 지난 날짜는 바꿀 수 없어요' });
      const natural = db.prepare('SELECT 1 AS x FROM recurring WHERE member_id=? AND dow=?').get(mem.id, dowOf(b.date)) ? 'solo' : 'together';
      if (b.status === natural) db.prepare('DELETE FROM overrides WHERE member_id=? AND date=?').run(mem.id, b.date);
      else db.prepare('INSERT OR REPLACE INTO overrides(member_id,date,status) VALUES(?,?,?)').run(mem.id, b.date, b.status);
      return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url === '/api/recurring') {
      const b = await readBody(req);
      const mem = db.prepare('SELECT id FROM members WHERE id=?').get(Number(b.memberId));
      if (!mem || !Array.isArray(b.days)) return send(res, 400, { error: '요청이 올바르지 않아요' });
      db.prepare('DELETE FROM recurring WHERE member_id=?').run(mem.id);
      [...new Set(b.days.map(Number))].filter(d => d >= 1 && d <= 5).forEach(d => db.prepare('INSERT INTO recurring(member_id,dow) VALUES(?,?)').run(mem.id, d));
      return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url === '/api/menu') {
      const b = await readBody(req);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date) || b.date < kstNow().date) return send(res, 400, { error: '날짜가 올바르지 않아요' });
      const text = String(b.text || '').trim().slice(0, 1000);
      if (text) db.prepare('INSERT OR REPLACE INTO menus(date,text) VALUES(?,?)').run(b.date, text);
      else db.prepare('DELETE FROM menus WHERE date=?').run(b.date);
      return send(res, 200, { ok: true });
    }
    send(res, 404, { error: '없는 주소예요' });
  } catch (e) {
    console.log('오류:', e.message);
    send(res, 500, { error: '서버 오류가 발생했어요' });
  }
});

if (process.argv.includes('--test-teams')) {
  sendTeams().then(() => process.exit(0)).catch(e => { console.log('팀즈 전송 실패:', e.message); process.exit(1); });
} else {
  server.listen(PORT, '0.0.0.0', () => {
    const ips = Object.values(require('os').networkInterfaces()).flat().filter(i => i.family === 'IPv4' && !i.internal).map(i => i.address);
    console.log('팀 점심 서버가 시작됐어요.');
    console.log(`이 컴퓨터에서: http://localhost:${PORT}`);
    ips.forEach(ip => console.log(`팀원 접속 주소: http://${ip}:${PORT}`));
  });
}
