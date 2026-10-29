// 평일 마감 시각에 팀즈로 오늘 점심 인원을 보내요. 예약 실행기가 이 주소를 호출해요.
// 보호: 요청 헤더 x-cron-secret 값이 환경변수 CRON_SECRET과 같아야 해요.
const L = require('./_lib');
module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers['x-cron-secret'] !== secret) return res.status(401).json({ error: '권한이 없어요' });
  try {
    const n = L.kstNow(), force = req.query && req.query.force === '1';
    if (!force) {
      if (n.dow < 1 || n.dow > 5) return res.status(200).json({ skipped: '주말이에요' });
      const sent = await L.sb('GET', 'meta?select=v&k=eq.notified');
      if (sent[0] && sent[0].v === n.date) return res.status(200).json({ skipped: '오늘은 이미 보냈어요' });
      await L.upsert('meta', 'k', [{ k: 'notified', v: n.date }]);
    }
    res.status(200).json(await L.sendTeams(n.date));
  } catch (e) { L.fail(res, e); }
};
