const L = require('./_lib');
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 가능해요' });
  if (!L.auth(req, res)) return;
  try {
    const b = L.body(req), id = Number(b.memberId);
    const mem = await L.sb('GET', `members?select=id&id=eq.${id}`);
    if (!mem.length || !Array.isArray(b.days)) return res.status(400).json({ error: '요청이 올바르지 않아요' });
    const days = [...new Set(b.days.map(Number))].filter(d => d >= 1 && d <= 5);
    await L.sb('DELETE', `recurring?member_id=eq.${id}`);
    if (days.length) await L.sb('POST', 'recurring', days.map(d => ({ member_id: id, dow: d })), { Prefer: 'return=minimal' });
    res.status(200).json({ ok: true });
  } catch (e) { L.fail(res, e); }
};
