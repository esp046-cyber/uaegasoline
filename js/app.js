/* Dubai Fuel Monitor – UI controller (vanilla ES6+) */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const APP_URL = 'https://esp046-cyber.github.io/dubaijebelalinews/';
  const WA_URL = 'https://esp046-cyber.github.io/uaegasoline/';
  const store = {
    get: (k, d) => { try { const v = localStorage.getItem('dubaifuel.' + k); return v === null ? d : JSON.parse(v); } catch (_) { return d; } },
    set: (k, v) => { try { localStorage.setItem('dubaifuel.' + k, JSON.stringify(v)); } catch (_) {} }
  };

  /* November 2026 baseline. UAE = Fuel Price Committee (effective 1 Nov 2026). PH = Metro Manila benchmark averages. */
  const BASELINE = {
    month: '2026-11',
    uae: [['Super 98', 4.16], ['Special 95', 4.04], ['E-Plus 91', 3.97], ['Diesel', 4.75]],
    ph:  [['RON 100 / Blaze', 68.00], ['RON 95 / Premium Unleaded', 58.15], ['RON 91 / Regular Unleaded', 56.65], ['Diesel', 56.75]]
  };
  const clone = o => JSON.parse(JSON.stringify(o));
  // New storage key (v2) so old placeholder prices from v1.0.0 are not reused.
  const saved = store.get('prices.v2', null);
  const state = {
    rate: store.get('rate', 15.8), live: false, rateTime: 0,
    dir: store.get('dir', 'AED2PHP'), grade: store.get('grade', 0), liters: store.get('liters', 67), mode: store.get('mode', 'standard'),
    prices: saved || { ...clone(BASELINE), edited: {}, src: 'official baseline' }
  };
  const persistPrices = () => store.set('prices.v2', state.prices);
  const fmt = (n, d = 2) => Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const monthLabel = ym => new Date(ym + '-01T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2200); }

  function applyMode(m) {
    state.mode = m; store.set('mode', m);
    document.body.classList.toggle('sunlight-mode', m === 'sunlight');
    document.body.classList.toggle('battery-save', m === 'battery');
    document.querySelectorAll('.seg').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
    $('meta[name=theme-color]').content = m === 'sunlight' ? '#ffffff' : m === 'battery' ? '#000000' : '#0a0d14';
  }

  function renderConverter() {
    const a2p = state.dir === 'AED2PHP';
    $('#dirBtn').textContent = a2p ? 'AED → PHP' : 'PHP → AED';
    $('#rateTxt').textContent = `1 AED = ${fmt(state.rate, 3)} PHP`;
    const v = parseFloat($('#amt').value) || 0;
    $('#convOut').textContent = a2p ? `${fmt(v * state.rate)} PHP` : `${fmt(v / state.rate)} AED`;
    renderFx();
    $('#receiptPhp').textContent = `278.72 AED ≈ ${fmt(278.72 * state.rate)} PHP at the current rate.`;
  }

  function renderFx() {
    const pill = $('#fxPill'), live = state.live && navigator.onLine;
    pill.classList.toggle('off', !live);
    if (live) {
      const m = Math.max(0, Math.floor((Date.now() - state.rateTime) / 60000));
      $('#fxText').textContent = `Live FX: 1 AED = ${fmt(state.rate, 3)} PHP (${m < 1 ? 'Updated just now' : 'Updated ' + m + 'm ago'})`;
    } else {
      $('#fxText').textContent = `Offline Cached Rate · 1 AED = ${fmt(state.rate, 3)} PHP`;
    }
  }

  function renderMatrix() {
    const L = state.liters, r = state.rate, { uae, ph, edited } = state.prices;
    let h = `<tr><th>Grade (UAE / PH)</th><th>UAE AED/L</th><th>UAE PHP/L</th><th>PH PHP/L</th><th>UAE ${L}L</th><th>PH ${L}L</th><th>UAE vs PH</th></tr>`;
    uae.forEach(([name, price], i) => {
      const phName = ph[i][0], phPrice = ph[i][1], uaePhp = price * r, diff = (uaePhp - phPrice) / phPrice * 100;
      h += `<tr><td>${name}<br><small class="note">${phName}</small></td>
        <td class="mono price" data-c="uae" data-i="${i}">${fmt(price)}${edited['uae' + i] ? '*' : ''}</td>
        <td class="mono">${fmt(uaePhp)}</td>
        <td class="mono price" data-c="ph" data-i="${i}">${fmt(phPrice)}${edited['ph' + i] ? '*' : ''}</td>
        <td class="mono">${fmt(price * L)} AED<br><small class="note">${fmt(price * L * r, 0)} PHP</small></td>
        <td class="mono">${fmt(phPrice * L, 0)} PHP<br><small class="note">${fmt(phPrice * L / r)} AED</small></td>
        <td><span class="pill ${diff <= 0 ? 'good' : 'bad'}">${diff > 0 ? '+' : ''}${fmt(diff, 1)}%</span></td></tr>`;
    });
    $('#matrix').innerHTML = h;
    $('#matrixCards').innerHTML = uae.map(([name, price], i) => {
      const phName = ph[i][0], phPrice = ph[i][1], uaePhp = price * r, diff = (uaePhp - phPrice) / phPrice * 100;
      return `<article class="mcard">
        <header><h3>${name} <span>vs ${phName}</span></h3><span class="pill ${diff <= 0 ? 'good' : 'bad'}">${diff > 0 ? '+' : ''}${fmt(diff, 1)}%</span></header>
        <div class="cols">
          <div><h4>🇦🇪 UAE</h4>
            <p class="lbl">Per litre</p><p class="num">${fmt(price)} AED</p><p class="sub-num">≈ ${fmt(uaePhp)} PHP</p>
            <p class="lbl">${L} L tank</p><p class="num">${fmt(price * L)} AED</p><p class="sub-num">≈ ${fmt(price * L * r, 0)} PHP</p></div>
          <div><h4>🇵🇭 Philippines</h4>
            <p class="lbl">Per litre</p><p class="num">${fmt(phPrice)} PHP</p><p class="sub-num">≈ ${fmt(phPrice / r)} AED</p>
            <p class="lbl">${L} L tank</p><p class="num">${fmt(phPrice * L, 0)} PHP</p><p class="sub-num">≈ ${fmt(phPrice * L / r)} AED</p></div>
        </div>
        <footer><button class="btn ghost price" data-c="uae" data-i="${i}">Edit AED/L${edited['uae' + i] ? ' *' : ''}</button>
          <button class="btn ghost price" data-c="ph" data-i="${i}">Edit PHP/L${edited['ph' + i] ? ' *' : ''}</button></footer>
      </article>`;
    }).join('');
    const nowYm = new Date().toISOString().slice(0, 7);
    const stale = state.prices.month !== nowYm;
    const el = $('#priceStatus');
    el.textContent = `UAE prices: ${monthLabel(state.prices.month)} (${state.prices.src}).` + (stale ? ' A newer monthly announcement may be out: tap Sync UAE prices.' : '') + ' * = your edit.';
    el.style.color = stale ? 'var(--accent)' : '';
    $('#matrixNote').textContent = 'Negative % means UAE fuel is cheaper than the Philippines after conversion. Tap a price to edit it.';
  }
  document.addEventListener('click', e => {
    const td = e.target.closest('.price'); if (!td) return;
    const { c, i } = td.dataset, cur = state.prices[c][i][1];
    const v = parseFloat(prompt(`New ${c === 'uae' ? 'AED' : 'PHP'}/L price for ${state.prices[c][i][0]}:`, cur));
    if (v > 0) { state.prices[c][i][1] = v; state.prices.edited[c + i] = true; persistPrices(); renderMatrix(); }
  });
  $('#resetPrices').onclick = () => { state.prices = { ...clone(BASELINE), edited: {}, src: 'official baseline' }; persistPrices(); renderMatrix(); toast('Baseline restored'); };

  /* ---- live syncs ---- */
  async function syncFx() {
    const r = await NewsFetcher.getRate();
    state.rate = r.rate; state.live = r.live; state.rateTime = r.t; store.set('rate', r.rate);
    renderConverter(); renderMatrix();   // recalculates the whole matrix
  }
  async function syncUae(manual) {
    const r = await NewsFetcher.syncUaePrices().catch(() => null);
    if (!r) { if (manual) toast('No new announcement found'); return; }
    r.prices.forEach((p, i) => { if (!state.prices.edited['uae' + i]) state.prices.uae[i][1] = p; });
    state.prices.month = r.month; state.prices.src = 'synced from news'; persistPrices(); renderMatrix();
    if (manual) toast('UAE prices updated');
  }
  $('#syncPrices').onclick = () => syncUae(true);

  function renderNews(res) {
    const ul = $('#news'); ul.innerHTML = '';
    res.items.forEach(n => {
      const li = document.createElement('li');
      const a = document.createElement('a'); a.href = n.link; a.target = '_blank'; a.rel = 'noopener'; a.textContent = n.title;
      const s = document.createElement('small'); s.textContent = n.source + (n.date ? ' · ' + new Date(n.date).toLocaleDateString() : '');
      const b = document.createElement('button'); b.className = 'btn ghost sh'; b.textContent = 'Share'; b.onclick = () => share(n.title, n.link);
      li.append(a, s, b); ul.append(li);
    });
    $('#newsStatus').textContent = !res.items.length ? 'Live feeds unavailable. Use the official sources below.'
      : `Updated ${new Date(res.t).toLocaleTimeString()}${res.offline ? ' (saved copy, offline)' : ''}`;
  }
  async function loadNews(force) { $('#newsStatus').textContent = 'Loading…'; renderNews(await NewsFetcher.load(force)); }
  $('#fallbackCards').innerHTML = NewsFetcher.FALLBACK_CARDS.map(c => `<a href="${c.url}" target="_blank" rel="noopener">${c.title}<small>${c.note}</small></a>`).join('');
  $('#refreshNews').onclick = () => loadNews(true);

  async function share(text, url = APP_URL) {
    try {
      if (navigator.share) return await navigator.share({ title: 'Dubai Fuel Monitor', text, url });
      await navigator.clipboard.writeText(`${text}\n${url}`); toast('Copied to clipboard');
    } catch (e) { if (e.name !== 'AbortError') toast('Could not share'); }
  }
  function priceSummary() {
    const L = state.liters, p = state.prices.uae[0][1];
    return `Dubai fuel (${monthLabel(state.prices.month)}): Super 98 ${fmt(p)} AED/L ≈ ${fmt(p * state.rate)} PHP/L. ${L}L fill-up = ${fmt(p * L)} AED ≈ ${fmt(p * L * state.rate, 0)} PHP. 1 AED = ${fmt(state.rate, 3)} PHP.`;
  }
  $('#shareBtn').onclick = () => share(priceSummary());

  let deferred;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; if (!store.get('installDismissed', false)) $('#installBar').hidden = false; });
  $('#installBtn').onclick = async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; $('#installBar').hidden = true; };
  $('#installClose').onclick = () => { $('#installBar').hidden = true; store.set('installDismissed', true); };
  window.addEventListener('appinstalled', () => { $('#installBar').hidden = true; toast('Installed'); });
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  $('#iosBtn').onclick = () => { $('#iosModal').hidden = false; };
  $('#iosClose').onclick = () => { $('#iosModal').hidden = true; };
  if (isIOS && !standalone && !store.get('iosShown', false)) { store.set('iosShown', true); setTimeout(() => { $('#iosModal').hidden = false; }, 1500); }

  let y0 = null;
  addEventListener('touchstart', e => { y0 = scrollY === 0 ? e.touches[0].clientY : null; }, { passive: true });
  addEventListener('touchmove', e => { if (y0 !== null) $('#ptr').classList.toggle('on', e.touches[0].clientY - y0 > 90); }, { passive: true });
  addEventListener('touchend', () => { if ($('#ptr').classList.contains('on')) { $('#ptr').classList.remove('on'); refreshAll(); } y0 = null; });
  const refreshAll = () => { syncFx(); syncUae(false); loadNews(true); };

  document.querySelectorAll('.seg').forEach(b => b.onclick = () => applyMode(b.dataset.mode));
  $('#dirBtn').onclick = () => { state.dir = state.dir === 'AED2PHP' ? 'PHP2AED' : 'AED2PHP'; store.set('dir', state.dir); renderConverter(); };
  $('#amt').oninput = renderConverter;
  const buzz = () => { try { navigator.vibrate && navigator.vibrate(10); } catch (_) {} };
  let animId = 0;
  function applyLiters(v) {
    state.liters = v; $('#vol').value = v; $('#volOut').textContent = v; store.set('liters', v);
    document.querySelectorAll('.vp').forEach(b => b.classList.toggle('on', +b.dataset.v === v));
    renderMatrix();
  }
  function animateTo(target) {
    const id = ++animId, from = state.liters;
    const still = from === target || state.mode === 'battery' || matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still) return applyLiters(target);
    const t0 = performance.now(), dur = 300;
    const step = t => {
      if (id !== animId) return;
      const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      applyLiters(Math.round(from + (target - from) * e));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  $('#vol').oninput = e => { animId++; applyLiters(+e.target.value); };
  document.querySelectorAll('.vp').forEach(b => b.onclick = () => { buzz(); animateTo(+b.dataset.v); });

  /* WhatsApp share */
  $('#gradeSel').value = state.grade;
  $('#gradeSel').onchange = e => { state.grade = +e.target.value; store.set('grade', state.grade); };
  function waText() {
    const L = state.liters, r = state.rate, i = state.grade, [name, price] = state.prices.uae[i], [phName, phPrice] = state.prices.ph[i];
    return `⛽ Dubai Fuel Update (${monthLabel(state.prices.month)}): ${name}: ${fmt(price)} AED/L (₱${fmt(price * r)}/L) | PH ${phName}: ₱${fmt(phPrice)}/L.
` +
      `${L}L fill-up: ${fmt(price * L)} AED (~₱${fmt(price * L * r, 0)}).
Compare here: ${WA_URL}`;
  }
  $('#waBtn').onclick = () => window.open('https://wa.me/?text=' + encodeURIComponent(waText()), '_blank', 'noopener');

  applyLiters(state.liters);
  applyMode(state.mode); renderConverter(); renderMatrix(); loadNews(false);
  syncFx(); syncUae(false);                                  // live FX + price sync on startup
  setInterval(syncFx, 15 * 60 * 1000);                        // FX every 15 min while open
  setInterval(() => syncUae(false), 6 * 60 * 60 * 1000);
  addEventListener('online', refreshAll);
  addEventListener('offline', renderFx);
  setInterval(renderFx, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) syncFx(); });

  if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
})();
