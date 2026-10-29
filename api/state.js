const L = require('./_lib');
module.exports = async (req, res) => {
  if (!L.auth(req, res)) return;
  try {
    const n = L.kstNow();
    const from = new Date(n.date + 'T00:00:00Z'); from.setUTCDate(from.getUTCDate() - 8);
    const [members, recurring, overrides, menus] = await Promise.all([
      L.sb('GET', 'members?select=id,name&order=name'),
      L.sb('GET', 'recurring?select=member_id,dow'),
      L.sb('GET', `overrides?select=member_id,date,status&date=gte.${from.toISOString().slice(0, 10)}`),
      L.sb('GET', `menus?select=text&date=eq.${n.date}`)
    ]);
    res.status(200).json({ members, recurring, overrides, menu: menus[0] ? menus[0].text : '',
      today: n.date, h: n.h, m: n.m, deadline: L.DEADLINE, locked: L.isLocked(n.date) });
  } catch (e) { L.fail(res, e); }
};
