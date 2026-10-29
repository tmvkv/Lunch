const L = require('./_lib');
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 가능해요' });
  if (!L.auth(req, res)) return;
  try {
    const b = L.body(req), id = Number(b.memberId);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date) || isNaN(Date.parse(b.date))) return res.status(400).json({ error: '날짜가 올바르지 않아요' });
    if (!['together', 'solo', 'away'].includes(b.status)) return res.status(400).json({ error: '상태가 올바르지 않아요' });
    if (L.isLocked(b.date)) return res.status(403).json({ error: '마감되었거나 지난 날짜는 바꿀 수 없어요' });
    const mem = await L.sb('GET', `members?select=id&id=eq.${id}`);
    if (!mem.length) return res.status(400).json({ error: '팀원을 찾을 수 없어요' });
    const rec = await L.sb('GET', `recurring?select=dow&member_id=eq.${id}&dow=eq.${L.dowOf(b.date)}`);
    const natural = rec.length ? 'solo' : 'together';
    if (b.status === natural) await L.sb('DELETE', `overrides?member_id=eq.${id}&date=eq.${b.date}`);
    else await L.upsert('overrides', 'member_id,date', [{ member_id: id, date: b.date, status: b.status }]);
    res.status(200).json({ ok: true });
  } catch (e) { L.fail(res, e); }
};
