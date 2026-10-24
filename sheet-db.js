(function () {
  const API = 'https://script.google.com/macros/s/AKfycbx-JQXOBlBGeXCWTnAaTlHZa0cSY5PVorB0hHmmvyyFCrwrZZ5FequtCdLGHTuOSXnKiA/exec';

  // همهٔ کلیدهایی که صفحه‌ها استفاده می‌کنند (قبلاً پرداخت‌ها، اشخاص و ... جا افتاده بودند)
  const KEYS = [
    'cafe_orders_v1', 'cafe_invoices_v1', 'cafe_seen_v1', 'cafe_no_v1', 'cafe_inv_del_v1', 'cafe_staff_v1',
    'cafe_pay_v1',          // پرداخت‌ها و رسیدهای مشتری
    'cafe_inv_person_v1',   // نسبت‌دادن فاکتور به شخص
    'cafe_people_v1',       // لیست اشخاص
    'cafe_no_reset_v2'      // پرچم شماره‌گذاری مجدد (یک‌بار)
  ];

  // هر سلول گوگل شیت حداکثر ۵۰٬۰۰۰ کاراکتر؛ مقدارهای بزرگ‌تر تکه‌تکه ذخیره می‌شوند
  const CH = 40000, MARK = '@@chunks:';

  const me = document.currentScript;
  const needAuth = me && me.dataset.auth === '1';
  const cache = {}, pending = {}, timers = {}, seenVer = {};
  let token = '', offline = false;
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

  // خواندن مقدار یک کلید از پاسخ شیت (با پشتیبانی از تکه‌ها)
  function unpack(data, k) {
    let v = data[k];
    if (v == null) return undefined;
    if (typeof v !== 'string') return String(v);          // شیت گاهی "1" را عدد برمی‌گرداند
    if (!v.startsWith(MARK)) return v;
    const n = +v.slice(MARK.length); let s = '';
    for (let i = 0; i < n; i++) {
      const p = data[k + '~' + i];
      if (p == null) return undefined;
      s += p;
    }
    return s;
  }

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
        KEYS.forEach(k => {
          const v = res.data ? unpack(res.data, k) : undefined;
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

  async function setKey(key, value) {
    const res = await call({ action: 'set', key, value, token });
    if (!res || !res.ok) throw new Error('set failed');
  }

  function push(k) {
    clearTimeout(timers[k]);
    timers[k] = setTimeout(async () => {
      const v = cache[k];
      try {
        if (v.length <= CH) await setKey(k, v);
        else {
          const n = Math.ceil(v.length / CH);
          for (let i = 0; i < n; i++) await setKey(k + '~' + i, v.slice(i * CH, (i + 1) * CH));
          await setKey(k, MARK + n);
        }
        seenVer[k] = v;
        if (cache[k] === v) delete pending[k];     // اگر در حین ارسال تغییر کرده، pending بماند
        if (!Object.keys(pending).length) note('');
      } catch (e) { note('ذخیره در شیت ناموفق بود؛ دوباره تلاش می‌شود'); timers[k] = setTimeout(() => push(k), 3000); }
    }, pending[k] ? 400 : 50);
  }

  let refreshing = false;
  async function refresh() {
    if (!needAuth || !token || refreshing || Object.keys(pending).length) return;
    refreshing = true;
    try {
      const res = await call({ action: 'all', token });
      if (!res.data || Object.keys(pending).length) return;
      KEYS.forEach(k => {
        const v = unpack(res.data, k);
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
    setInterval(refresh, 10000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
    addEventListener('focus', refresh);
  });
})();
