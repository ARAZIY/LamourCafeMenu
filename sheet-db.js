(function () {
  const API = 'https://script.google.com/macros/s/AKfycbx-JQXOBlBGeXCWTnAaTlHZa0cSY5PVorB0hHmmvyyFCrwrZZ5FequtCdLGHTuOSXnKiA/exec';

  // همهٔ کلیدهایی که صفحه‌ها استفاده می‌کنند
  const KEYS = [
    'cafe_orders_v1', 'cafe_invoices_v1', 'cafe_seen_v1', 'cafe_no_v1', 'cafe_inv_del_v1', 'cafe_staff_v1',
    'cafe_pay_v1',          // پرداخت‌ها و رسیدهای مشتری
    'cafe_inv_person_v1',   // نسبت‌دادن فاکتور به شخص
    'cafe_people_v1',       // لیست اشخاص
    'cafe_no_reset_v2'      // پرچم شماره‌گذاری مجدد (یک‌بار)
  ];

  const me = document.currentScript;
  const needAuth = me && me.dataset.auth === '1';
  const cache = {}, pending = {}, timers = {}, seenVer = {};
  let token = '', offline = false, lastV = null, refreshing = false;
  try { token = localStorage.getItem('sheet_token') || ''; } catch (e) {}

  const badge = document.createElement('div');
  badge.style.cssText = 'position:fixed;bottom:8px;left:8px;z-index:99;font:12px Vazirmatn,Tahoma,sans-serif;padding:3px 10px;border-radius:99px;background:#b3392f;color:#fff;display:none';
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(badge));
  const note = t => { badge.textContent = t || ''; badge.style.display = t ? 'block' : 'none'; };

  async function call(body) {
    const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
    return r.json();
  }
  const mirror = (k, v) => { try { localStorage.setItem('db:' + k, v); } catch (e) {} };
  const val = (data, k) => (data[k] == null ? undefined : String(data[k]));   // شیت گاهی "1" را عدد می‌کند

  async function load() {
    if (!needAuth) return;
    for (let tries = 0; tries < 2; tries++) {
      if (!token) {
        token = (prompt('کلید دسترسی را وارد کنید (همان SECRET داخل Apps Script):') || '').trim();
        if (!token) break;
      }
      try {
        const res = await call({ action: 'all', token });
        if (res.error === 'auth') { token = ''; try { localStorage.removeItem('sheet_token'); } catch (e) {} alert('کلید دسترسی اشتباه است'); continue; }
        try { localStorage.setItem('sheet_token', token); } catch (e) {}
        if (res.v !== undefined) lastV = res.v;
        KEYS.forEach(k => {
          const v = res.data ? val(res.data, k) : undefined;
          if (v !== undefined) { cache[k] = v; seenVer[k] = v; mirror(k, v); }
          else {
            let old = null; try { old = localStorage.getItem(k); } catch (e) {}   // انتقال داده‌های قبلی مرورگر به شیت
            if (old == null) { try { old = localStorage.getItem('db:' + k); } catch (e) {} }
            if (old != null) { cache[k] = old; DB.set(k, old); }
          }
        });
        offline = false; note(''); return;
      } catch (e) { break; }
    }
    offline = true; note('اتصال به شیت برقرار نیست');
    KEYS.forEach(k => { try { const v = localStorage.getItem('db:' + k); if (v != null) cache[k] = v; } catch (e) {} });
  }

  async function menu() {
    try {
      const r = await fetch(API + '?action=menu', { signal: AbortSignal.timeout(6000) });
      const rows = await r.json();
      if (!Array.isArray(rows) || !rows.length) return null;
      return rows.filter(x => x.name).map(x => ({
        n: String(x.name), c: String(x.category || 'سایر'), p: Number(x.price) || 0,
        i: String(x.image || ''), d: String(x.description || '')
      }));
    } catch (e) { return null; }
  }

  function push(k) {
    clearTimeout(timers[k]);
    timers[k] = setTimeout(async () => {
      const v = cache[k];
      try {
        const res = await call({ action: 'set', key: k, value: v, token });
        if (!res.ok) throw 0;
        seenVer[k] = v;
        if (cache[k] === v) delete pending[k];   // اگر در حین ارسال تغییر کرده، pending بماند
        if (!Object.keys(pending).length) note('');
      } catch (e) { note('ذخیره در شیت ناموفق بود؛ دوباره تلاش می‌شود'); timers[k] = setTimeout(() => push(k), 3000); }
    }, pending[k] ? 400 : 50);
  }

  async function refresh() {
    if (!needAuth || !token || refreshing || Object.keys(pending).length) return;
    refreshing = true;
    try {
      // اول فقط شمارندهٔ نسخه (سبک)؛ اگر عوض نشده بود چیزی دانلود نمی‌شود
      try {
        const vr = await call({ action: 'ver', token });
        if (vr && vr.ok && vr.v === lastV) { if (offline) { offline = false; note(''); } return; }
      } catch (e) { return; }
      const res = await call({ action: 'all', token });
      if (!res.data || Object.keys(pending).length) return;
      if (res.v !== undefined) lastV = res.v;
      KEYS.forEach(k => {
        const v = val(res.data, k);
        if (v !== undefined && v !== cache[k] && !pending[k]) {
          cache[k] = v; seenVer[k] = v; mirror(k, v);
          window.dispatchEvent(new StorageEvent('storage', { key: k }));
        }
      });
      if (offline) { offline = false; note(''); }
    } catch (e) {} finally { refreshing = false; }
  }

  const DB = window.DB = {
    menu: null,
    get: k => (k in cache ? cache[k] : null),
    set(k, v) { cache[k] = String(v); mirror(k, cache[k]); pending[k] = 1; push(k); }
  };
  DB.ready = Promise.all([load(), menu()]).then(([, m]) => {
    DB.menu = m;
    setInterval(refresh, 8000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
    addEventListener('focus', refresh);
  });
})();
