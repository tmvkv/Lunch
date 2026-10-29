const L = require('./_lib');
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 가능해요' });
  if (!L.auth(req, res)) return;
  try {
    const b = L.body(req);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date) || b.date < L.kstNow().date) return res.status(400).json({ error: '날짜가 올바르지 않아요' });
    const text = String(b.text || '').trim().slice(0, 1000);
    if (text) await L.upsert('menus', 'date', [{ date: b.date, text }]);
    else await L.sb('DELETE', `menus?date=eq.${b.date}`);
    res.status(200).json({ ok: true });
  } catch (e) { L.fail(res, e); }
};
