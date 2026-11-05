(function () {
  const API = 'https://script.google.com/macros/s/AKfycbxfgrHy_6LXinLMw_skIIimvnG5n9LCGMffgjdTjjVbFyLheSBrw6HdUg03jYy7ylw9uA/exec';

  const KEYS = [
    'cafe_orders_v1', 'cafe_invoices_v1', 'cafe_seen_v1', 'cafe_no_v1', 'cafe_inv_del_v1', 'cafe_staff_v1',
    'cafe_pay_v1',          // پرداخت‌ها و رسیدهای مشتری
    'cafe_inv_person_v1',   // نسبت‌دادن فاکتور به شخص
    'cafe_people_v1',       // لیست اشخاص
    'cafe_no_reset_v2'      // پرچم شماره‌گذاری مجدد (یک‌بار)
  ];

  const me = document.currentScript;
  const needAuth = me && me.dataset.auth === '1';
  // شعبه: data-prefix="l2_" یعنی همهٔ کلیدها در شیت با پیشوند l2_ ذخیره می‌شوند (شعبهٔ اصلی بدون پیشوند)
  const PFX = (me && me.dataset.prefix) || '';
  // منوی شعبه: data-menu="Menu2" یعنی منو از تب Menu2 خوانده شود (اگر نبود، از Menu)
  const MENU_SHEET = (me && me.dataset.menu) || '';
  const R = k => PFX + k;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const cache = {}, pending = {}, timers = {}, seenVer = {};
  let token = '', offline = false, lastV = null, refreshing = false;
  try { token = localStorage.getItem('sheet_token') || ''; } catch (e) {}

  const badge = document.createElement('div');
  badge.style.cssText = 'position:fixed;bottom:8px;left:8px;z-index:99;font:12px Vazirmatn,Tahoma,sans-serif;padding:3px 10px;border-radius:99px;background:#b3392f;color:#fff;display:none';
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(badge));
  const note = t => { badge.textContent = t || ''; badge.style.display = t ? 'block' : 'none'; };

  async function call(body) {
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000)
    });
    return r.json();
  }
  const mirror = (k, v) => { try { localStorage.setItem('db:' + R(k), v); } catch (e) {} };
  const val = (data, k) => (data[R(k)] == null ? undefined : String(data[R(k)]));   // شیت گاهی "1" را عدد می‌کند

  // پر کردن کش از نسخهٔ ذخیره‌شده در مرورگر؛ true اگر چیزی بود
  function loadMirror() {
    let any = false;
    KEYS.forEach(k => { try { const v = localStorage.getItem('db:' + R(k)); if (v != null) { cache[k] = v; any = true; } } catch (e) {} });
    return any;
  }

  /* همگام‌سازی با شیت.
     bg=false: اولین بارگذاری (صفحه منتظر می‌ماند)
     bg=true : در پس‌زمینه؛ فقط کلیدهایی که تغییر کرده‌اند و در حال ذخیره نیستند به‌روز می‌شوند */
  async function sync(bg) {
    for (let tries = 0; tries < 3; tries++) {
      if (!token) {
        token = (prompt('کلید دسترسی را وارد کنید (همان SECRET داخل Apps Script):') || '').trim();
        if (!token) break;
      }
      try {
        const res = await call({ action: 'all', token, p: PFX });
        if (res.error === 'auth') { token = ''; try { localStorage.removeItem('sheet_token'); } catch (e) {} alert('کلید دسترسی اشتباه است'); continue; }
        if (res.error === 'busy') { await sleep(1500); continue; }       // سرور مشغول است؛ دوباره تلاش
        if (!res.ok || !res.data) break;                                  // پاسخ ناقص: هرگز به‌عنوان «شیت خالی» قبول نشود
        try { localStorage.setItem('sheet_token', token); } catch (e) {}
        if (res.v !== undefined) lastV = res.v;
        const changed = [];
        KEYS.forEach(k => {
          const v = val(res.data, k);
          if (v !== undefined) {
            if (bg) {
              if (!pending[k] && v !== cache[k]) { cache[k] = v; seenVer[k] = v; mirror(k, v); changed.push(k); }
            } else { cache[k] = v; seenVer[k] = v; mirror(k, v); }
          } else if (!PFX && !bg) {
            // فقط شعبهٔ اصلی: انتقال داده‌های قبلی مرورگر به شیت
            let old = null; try { old = localStorage.getItem(k); } catch (e) {}
            if (old == null) { try { old = localStorage.getItem('db:' + k); } catch (e) {} }
            if (old != null) { cache[k] = old; DB.set(k, old); }
          }
        });
        offline = false; note('');
        changed.forEach(k => window.dispatchEvent(new StorageEvent('storage', { key: k })));
        return true;
      } catch (e) { break; }
    }
    offline = true; note('اتصال به شیت برقرار نیست');
    if (!bg) loadMirror();
    return false;
  }

  async function load() {
    if (!needAuth) return;
    // اگر قبلاً وارد شده‌ایم و نسخهٔ محلی داریم، صفحه فوراً با آن باز می‌شود و همگام‌سازی در پس‌زمینه انجام می‌شود
    if (token && loadMirror()) { sync(true); return; }
    await sync(false);
  }

  async function menu() {
    try {
      const url = API + '?action=menu' + (MENU_SHEET ? '&sheet=' + encodeURIComponent(MENU_SHEET) : '');
      const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
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
        const res = await call({ action: 'set', key: R(k), value: v, token });
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
        const vr = await call({ action: 'ver', token, p: PFX });
        if (vr && vr.ok && vr.v === lastV) { if (offline) { offline = false; note(''); } return; }
      } catch (e) { return; }
      const res = await call({ action: 'all', token, p: PFX });
      if (!res.ok || !res.data || Object.keys(pending).length) return;
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
  // کلوپ مشتریان: فراخوانی با کلید (ادمین و صفحهٔ اعضا) و فراخوانی عمومی بدون کلید (صفحهٔ مشتری)
  DB.club = b => call(Object.assign({ token, p: PFX }, b));
  DB.pub = b => call(b);

  // منو در پس‌زمینه بارگذاری می‌شود؛ صفحه‌های مدیریتی بیشتر از ۱٫۵ ثانیه منتظرش نمی‌مانند
  const menuP = menu().then(m => { DB.menu = m; return m; });
  const menuWait = needAuth ? Promise.race([menuP, sleep(1500)]) : menuP;
  DB.ready = Promise.all([load(), menuWait]).then(() => {
    setInterval(refresh, 8000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
    addEventListener('focus', refresh);
  });
})();
