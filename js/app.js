/* Dubai Fuel Monitor – UI controller (vanilla ES6+) */
(() => {
  'use strict';
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const APP_URL = 'https://esp046-cyber.github.io/uaegasoline/';
  const store = {
    get: (k, d) => { try { const v = localStorage.getItem('dubaifuel.' + k); return v === null ? d : JSON.parse(v); } catch (_) { return d; } },
    set: (k, v) => { try { localStorage.setItem('dubaifuel.' + k, JSON.stringify(v)); } catch (_) {} }
  };

  /* November 2026 baseline: UAE = Fuel Price Committee; PH = Metro Manila benchmark averages. */
  const BASELINE = {
    month: '2026-11', phVer: '2026-11-10b',
    uae: [['Super 98', 4.16], ['Special 95', 4.04], ['E-Plus 91', 3.97], ['Diesel', 4.75]],
    ph:  [['RON 97/100', 83.90], ['RON 95', 76.50], ['RON 91', 74.70], ['Diesel', 90.35]]
  };
  /* Official UAE Fuel Price Committee prices, AED/L. */
  const HISTORY = { labels: ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'], s98: [3.95, 3.40, 3.60, 3.80, 4.40, 4.16], s95: [3.83, 3.29, 3.49, 3.69, 4.28, 4.04] };
  const ADDONS = { coffee: ['Oasis Coffee', 12], manual: ['Manual Wash', 40], auto: ['Auto Wash', 30] };
  const clone = o => JSON.parse(JSON.stringify(o));
  const saved = store.get('prices.v2', null);
  if (saved && saved.phVer !== BASELINE.phVer) {          // refresh old PH baseline, keep rows the user edited
    saved.ph.forEach((row, i) => { if (!(saved.edited && saved.edited['ph' + i])) row[1] = BASELINE.ph[i][1]; row[0] = BASELINE.ph[i][0]; });
    saved.phVer = BASELINE.phVer; try { localStorage.setItem('dubaifuel.prices.v2', JSON.stringify(saved)); } catch (_) {}
  }
  const APP_VERSION = 'v1.0.10', PH_NOTE = 'PH: Nov 10, 2026 DOE post-rollback avg';
  const state = {
    rate: store.get('rate', 15.8), live: false, rateTime: 0,
    dir: store.get('dir', 'AED2PHP'), liters: (store.get('car', null) || {}).liters || store.get('liters', 67), grade: store.get('grade', 0),
    mode: store.get('mode', 'standard'), primary: store.get('primary', 'AED'), cb: store.get('cb', 0),
    addons: store.get('addons', []), salik: store.get('salik', 4), split: 1, qb: { cur: 'AED', amt: 50 }, cat: 'all',
    news: { items: [], t: 0 }, prices: saved || { ...clone(BASELINE), edited: {}, src: 'official baseline' }
  };
  state.animating = false; state.lockFx = null; state.cash = null; state.prev = 67; state.editing = false; state.geo = null; state.total = 0; state.storyTheme = store.get('storyTheme', 'obsidian');
  const GRADE_KEYS = ['98', '95', '91', 'diesel'];
  (() => {                                               // ?grade=95&liters=67&addons=coffee,auto&show=PHP
    const q = new URLSearchParams(location.search), gi = GRADE_KEYS.indexOf(String(q.get('grade') || '').toLowerCase()), L = parseFloat(q.get('liters'));
    if (gi >= 0) state.grade = gi; if (L >= 10 && L <= 140) state.liters = L;
    if (q.has('addons')) state.addons = q.get('addons').split(',').filter(k => ADDONS[k]);
    if (['AED', 'PHP'].includes(String(q.get('show')).toUpperCase())) state.primary = String(q.get('show')).toUpperCase();
  })();
  function configUrl() { return APP_URL + '?' + new URLSearchParams({ grade: GRADE_KEYS[state.grade], liters: String(state.liters), addons: state.addons.join(','), show: state.primary }); }
  const persistPrices = () => store.set('prices.v2', state.prices);
  const fmt = (n, d = 2) => Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const LT = () => Number.isInteger(state.liters) ? String(state.liters) : fmt(state.liters, 1);
  const monthLabel = ym => new Date(ym + '-01T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const buzz = () => { try { navigator.vibrate && navigator.vibrate(10); } catch (_) {} };
  const toast = msg => { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2200); };
  const active = () => { const i = state.grade, [name, price] = state.prices.uae[i], [phName, phPrice] = state.prices.ph[i]; return { i, name, price, phName, phPrice }; };
  const num = el => Math.max(0, parseFloat(el.value) || 0);

  /* ---------- modes ---------- */
  function applyMode(m) {
    state.mode = m; store.set('mode', m);
    document.body.classList.toggle('sunlight-mode', m === 'sunlight');
    document.body.classList.toggle('battery-save', m === 'battery');
    $$('.seg[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
    $('meta[name=theme-color]').content = m === 'sunlight' ? '#ffffff' : m === 'battery' ? '#000000' : '#0a0d14';
  }

  /* ---------- converter + FX pill ---------- */
  function renderConverter() {
    const a2p = state.dir === 'AED2PHP', v = num($('#amt'));
    $('#dirBtn').textContent = a2p ? 'AED → PHP' : 'PHP → AED';
    $('#rateTxt').textContent = `1 AED = ${fmt(state.rate, 3)} PHP`;
    $('#convOut').textContent = a2p ? `${fmt(v * state.rate)} PHP` : `${fmt(v / state.rate)} AED`;
    $('#receiptPhp').textContent = `278.72 AED ≈ ${fmt(278.72 * state.rate)} PHP at the current rate.`;
    renderFx();
  }
  function renderFx() {
    const live = state.live && navigator.onLine;
    $('#fxPill').classList.toggle('off', !live);
    if (live) {
      const m = Math.max(0, Math.floor((Date.now() - state.rateTime) / 60000));
      $('#fxText').textContent = `Live FX: 1 AED = ${fmt(state.rate, 3)} PHP`;
      $('#fxAge').textContent = m < 1 ? 'just now' : `${m}m ago`;
    } else { $('#fxText').textContent = (navigator.onLine ? 'Cached FX' : 'Offline · Using cached rates') + `: 1 AED = ${fmt(state.rate, 3)} PHP`; $('#fxAge').textContent = ''; }
  }

  /* ---------- trackers + tip ---------- */
  function renderTrackers() {
    const d = new Date(), last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const days = Math.round((new Date(last.getFullYear(), last.getMonth(), last.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
    $('#trkUae').innerHTML = `<b>🇦🇪 UAE</b> ${days === 0 ? 'Next month’s prices are announced today' : `Next month’s prices in ${days} day${days === 1 ? '' : 's'}`} <small>(announced around month end)</small>`;
    const toTue = (2 - d.getDay() + 7) % 7;
    $('#trkPh').innerHTML = `<b>🇵🇭 PH</b> Weekly pump adjustment every Tuesday · ${toTue === 0 ? 'applies today' : `next in ${toTue} day${toTue === 1 ? '' : 's'}`}`;
  }
  function renderTip() {
    const b = store.get('budget', 1000), save = b * 0.05;
    $('#tipText').textContent = `Rough guides: heavy A/C use in summer heat can cut fuel economy by around 10–25% on short trips, idling with the A/C running gets 0 km per litre, and tyres about 10 psi under-pressure can add roughly 2% to fuel use. Example: a 5% saving on a ${fmt(b, 0)} AED monthly fuel budget is about ${fmt(save, 0)} AED (≈ ₱${fmt(save * state.rate, 0)}) a month. Check tyre pressure when cold, park in shade, vent hot air before turning on the A/C, and avoid long idling.`;
  }

  /* ---------- matrix (table + cards) ---------- */
  function renderMatrix() {
    if (state.editing) return;
    const r = state.rate, { uae, ph, edited } = state.prices, P = state.primary;
    const lockBtn = (c, i, label) => `<button class="unlock mini" data-c="${c}" data-i="${i}" aria-label="Custom Price Locked: unlock ${label} and sync"><span class="padlock" aria-hidden="true">🔒</span><span class="sync-ic" aria-hidden="true">⟳</span></button>`;
    const cell = (c, i, main, mainUnit, sub, label) => `<td class="pc${state.lockFx && state.lockFx.c === c && state.lockFx.i === i ? ' lockfx' : ''}" data-c="${c}" data-i="${i}">
      <button class="pcell" aria-label="Edit ${label} price per litre"><span class="num">${main}</span> <small>${mainUnit}</small> <span class="pen" aria-hidden="true">✎</span></button>
      <div class="sub-num">≈ ${sub}</div>${edited[c + i] ? lockBtn(c, i, label) : ''}</td>`;
    let h = '<thead><tr><th>Grade</th><th>🇦🇪 UAE</th><th>🇵🇭 PH</th><th>Gap</th></tr></thead><tbody>';
    uae.forEach(([name, price], i) => {
      const phName = ph[i][0], phPrice = ph[i][1], uaePhp = price * r, diff = (uaePhp - phPrice) / phPrice * 100;
      const u = P === 'AED' ? [fmt(price), 'AED', fmt(uaePhp) + ' PHP'] : [fmt(uaePhp), 'PHP', fmt(price) + ' AED'];
      const p = P === 'PHP' ? [fmt(phPrice), 'PHP', fmt(phPrice / r) + ' AED'] : [fmt(phPrice / r), 'AED', fmt(phPrice) + ' PHP'];
      h += `<tr class="${i === state.grade ? 'sel' : ''}"><th scope="row">${name}<small>vs ${phName}</small></th>${cell('uae', i, ...u.slice(0, 2), u[2], name + ' UAE')}${cell('ph', i, ...p.slice(0, 2), p[2], phName + ' Philippines')}
        <td><span class="pill ${diff <= 0 ? 'good' : 'bad'}">${diff > 0 ? '+' : ''}${fmt(diff, 1)}%</span></td></tr>`;
    });
    $('#matrix').innerHTML = h + '</tbody>';
    $('#phNote').textContent = PH_NOTE + (Date.now() > Date.parse('2026-11-17T00:00:00+08:00') ? ' · DOE adjusts weekly, so this may have changed' : '');
    const stale = state.prices.month !== new Date().toISOString().slice(0, 7), el = $('#priceStatus');
    el.textContent = `UAE prices: ${monthLabel(state.prices.month)} (${state.prices.src}). Tap any price to edit; 🔒 marks your own price.` + (stale ? ' A newer monthly announcement may be out: tap Sync UAE prices.' : '');
    el.style.color = stale ? 'var(--accent)' : '';
    $('#matrixNote').textContent = 'Gap: negative means UAE fuel is cheaper than the Philippines after conversion.';
  }
  function startEdit(btn) {
    const td = btn.closest('td'), { c, i } = td.dataset, cur = state.prices[c][i][1]; state.editing = true;
    td.innerHTML = `<input class="pedit" type="number" inputmode="decimal" step="any" min="0" value="${cur}" aria-label="New ${c === 'uae' ? 'AED' : 'PHP'} per litre price for ${state.prices[c][i][0]}"><div class="sub-num">${c === 'uae' ? 'AED' : 'PHP'}/L · Enter to save</div>`;
    const inp = td.querySelector('input'); inp.focus(); inp.select(); let done = false;
    const finish = save => {
      if (done) return; done = true; const v = parseFloat(inp.value); state.editing = false;
      if (save && v > 0 && v !== cur) { state.prices[c][i][1] = v; state.prices.edited[c + i] = true; state.lockFx = { c, i: +i }; persistPrices(); refresh(); setTimeout(() => { state.lockFx = null; }, 1200); }
      else renderMatrix();
    };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); });
    inp.addEventListener('blur', () => finish(true));
  }
  document.addEventListener('click', e => {
    const u = e.target.closest('.unlock');
    if (u) {
      const { c, i } = u.dataset; u.classList.add('spinning');
      setTimeout(() => {
        delete state.prices.edited[c + i]; state.prices[c][i][1] = BASELINE[c][i][1];
        persistPrices(); refresh(); if (c === 'uae') syncUae(true); else toast('Price unlocked');
      }, motionOK() ? 480 : 0);
      return;
    }
    const pc = e.target.closest('.pcell'); if (pc) startEdit(pc);
  });
  $('#resetPrices').onclick = () => { if (!confirm('Reset all prices to the November 2026 baseline? Prices you edited will be removed.')) return; state.prices = { ...clone(BASELINE), edited: {}, src: 'official baseline' }; persistPrices(); refresh(); toast('Baseline restored'); };
  $$('[data-prim]').forEach(b => b.onclick = () => { buzz(); vt(() => { state.primary = b.dataset.prim; store.set('primary', state.primary); $$('[data-prim]').forEach(x => x.classList.toggle('on', x === b)); refresh(); const mc = $('#matrix'); mc.classList.remove('swapping'); void mc.offsetWidth; mc.classList.add('swapping'); setTimeout(() => mc.classList.remove('swapping'), 220); }); });

  /* ---------- rewards, sparkline ---------- */
  function renderRewards() {
    const a = active(), net = a.price * (1 - state.cb / 100);
    $('#rwLbl').textContent = `ADNOC Rewards · ${LT()} L of ${a.name}`; $('#pts').textContent = fmt(Math.round(state.liters * 1743 / 67), 0);
    $('#netAed').textContent = `${fmt(net)} AED/L`; $('#netPhp').textContent = `≈ ${fmt(net * state.rate)} PHP/L (${a.name}, ${state.cb}% rebate)`;
  }
  function renderStrip() {
    $('#strip').innerHTML = state.prices.uae.map(([n, p], i) => `<button class="gt${i === state.grade ? ' on' : ''}" data-g="${i}" aria-pressed="${i === state.grade}"><span class="gn">${n}</span><b class="mono">${state.primary === 'AED' ? fmt(p) : '₱' + fmt(p * state.rate)}</b><small>${state.primary === 'AED' ? 'AED/L · ≈ ₱' + fmt(p * state.rate) : 'PHP/L · ≈ ' + fmt(p) + ' AED'}</small></button>`).join('');
  }
  function renderSpark() {
    const W = 320, H = 96, p = 10, all = [...HISTORY.s98, ...HISTORY.s95], lo = Math.min(...all) - .05, hi = Math.max(...all) + .05;
    const X = i => p + i * (W - 2 * p) / 5, Y = v => H - p - (v - lo) / (hi - lo) * (H - 2 * p);
    const line = (a, c) => `<polyline fill="none" stroke="${c}" stroke-width="2.5" stroke-linejoin="round" points="${a.map((v, i) => X(i) + ',' + Y(v)).join(' ')}"/><circle cx="${X(5)}" cy="${Y(a[5])}" r="4" fill="${c}"/>`;
    $('#spark').innerHTML = `<svg viewBox="0 0 ${W} ${H + 16}" role="img" aria-label="Super 98 and Special 95 prices from June to November 2026">${line(HISTORY.s95, 'var(--muted)')}${line(HISTORY.s98, 'var(--accent)')}` +
      HISTORY.labels.map((l, i) => `<text x="${X(i)}" y="${H + 12}" font-size="10" text-anchor="middle" fill="var(--muted)">${l}</text>`).join('') + '</svg>';
    const s = HISTORY.s98, max = Math.max(...s), min = Math.min(...s), now = s[5];
    $('#sparkNote').textContent = `Super 98 (bold line) is ${fmt(now)} now: ${fmt((max - now) / max * 100, 1)}% below the 6-month high (${fmt(max)}, Oct) and ${fmt((now - min) / min * 100, 1)}% above the low (${fmt(min)}, Jul). Special 95 is the thinner line.`;
  }

  /* ---------- fill-up, add-ons, quick budget, remittance ---------- */
  function renderStop() {
    const a = active(), fuel = a.price * state.liters, items = state.addons.filter(k => ADDONS[k]);
    const extra = items.reduce((s, k) => s + ADDONS[k][1], 0), tot = fuel + extra; state.total = tot;
    const R = (k, v, d) => `<span data-roll="${k}" data-to="${v}" data-d="${d}"></span>`;
    $('#stopOut').innerHTML = `<div class="ln"><span>${a.name} · ${LT()} L</span><b class="mono">${R('fuel', fuel, 2)} AED</b></div>` +
      items.map(k => `<div class="ln"><span>${ADDONS[k][0]}</span><b class="mono">${fmt(ADDONS[k][1])} AED</b></div>`).join('') +
      `<div class="ln tot"><span>Station visit total</span><b class="mono">${state.primary === 'AED' ? `${R('totA', tot, 2)} AED ≈ ${R('totP', tot * state.rate, 0)} PHP` : `${R('totP', tot * state.rate, 0)} PHP ≈ ${R('totA', tot, 2)} AED`}</b></div>`;
    rollNums('#stopOut', state.animating);
    $$('.ad').forEach(b => { const on = state.addons.includes(b.dataset.k); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  }
  $$('.ad').forEach(b => b.onclick = () => { buzz(); const k = b.dataset.k; state.addons = state.addons.includes(k) ? state.addons.filter(x => x !== k) : [...state.addons, k]; store.set('addons', state.addons); const ic = b.querySelector('.ic'); if (ic) { ic.classList.remove('pop'); void ic.offsetWidth; ic.classList.add('pop'); } renderStop(); });
  function renderQuick() {
    const r = state.rate, { cur, amt } = state.qb, aed = cur === 'AED' ? amt : amt / r, u = state.prices.uae, a = active();
    $$('.qb').forEach(b => b.classList.toggle('on', !!state.cash && b.dataset.cur === cur && +b.dataset.amt === amt));
    $('#cashReset').hidden = !state.cash;
    const label = cur === 'AED' ? 'AED ' + fmt(amt, 0) : '₱' + fmt(amt, 0) + ' (≈ AED ' + fmt(aed) + ')', Rq = (k, v) => `<span data-roll="${k}" data-to="${v}" data-d="2"></span>`;
    $('#qbOut').innerHTML = state.cash ? `${label} fills ${Rq('qbL', aed / a.price)} L of ${a.name}. The tank and totals above now match this amount.`
      : `${label} buys ${Rq('qb98', aed / u[0][1])} L of Super 98 or ${Rq('qb95', aed / u[1][1])} L of Special 95.`;
    rollNums('#qbOut', false);
    const tank = a.price * state.liters;
    $('#remit').innerHTML = `Remittance value: ${LT()} L of ${a.name} (<span data-roll="rmA" data-to="${tank}" data-d="2"></span> AED) equals about ₱<span data-roll="rmP" data-to="${tank * r}" data-d="0"></span> at today’s rate.`;
    rollNums('#remit', state.animating);
  }
  $$('.qb').forEach(b => b.onclick = e => {
    buzz(); animId++; state.animating = false; state.qb = { cur: b.dataset.cur, amt: +b.dataset.amt }; if (!state.cash) state.prev = state.liters; state.cash = { cur: state.qb.cur, amt: state.qb.amt }; refresh();
    const ic = b.querySelector('.ic'); ripple(b, e); b.classList.add('ok'); if (ic) ic.textContent = '✓';
    $('#qbOut').classList.add('flash');
    setTimeout(() => { b.classList.remove('ok'); if (ic) ic.textContent = '⛽'; $('#qbOut').classList.remove('flash'); }, 800);
  });

  function renderBudget() {
    const b = num($('#budget')), a = active(), tank = a.price * state.liters, r = state.rate, P = state.primary;
    const m = v => P === 'AED' ? `${fmt(v)} AED ≈ ₱${fmt(v * r, 0)}` : `₱${fmt(v * r, 0)} ≈ ${fmt(v)} AED`;
    if (!tank || !b) $('#budgetOut').textContent = 'Enter a monthly allowance in AED to see how many full tanks it covers.';
    else { const tanks = Math.floor(b / tank), left = b - tanks * tank;
      $('#budgetOut').textContent = `${m(b)} covers ${tanks} full ${LT()} L tank${tanks === 1 ? '' : 's'} of ${a.name} at ${m(tank)} each (one fill-up uses ${fmt(tank / b * 100, 1)}% of the budget). Left over after full tanks: ${m(left)}.`; }
    clearTimeout(renderBudget.t); renderBudget.t = setTimeout(refreshLog, 200);
  }

  /* ---------- commute ---------- */
  function renderCommute() {
    const route = $('#route').value, km = route === 'custom' ? num($('#customKm')) : +route;
    $('#customKmWrap').hidden = route !== 'custom';
    const a = active(), r = state.rate, lit = km / +$('#eff').value, fuel = lit * a.price, sal = +$('#gates').value * state.salik, tot = fuel + sal, n = state.split;
    const both = v => state.primary === 'AED' ? `${fmt(v)} AED ≈ ₱${fmt(v * r, 0)}` : `₱${fmt(v * r, 0)} ≈ ${fmt(v)} AED`;
    $('#commuteOut').innerHTML = `<div class="ln"><span>Fuel used</span><b class="mono">${fmt(lit)} L</b></div><div class="ln"><span>Fuel (${a.name})</span><b class="mono">${both(fuel)}</b></div>` +
      `<div class="ln"><span>Salik</span><b class="mono">${both(sal)}</b></div><div class="ln tot"><span>Trip total</span><b class="mono">${both(tot)}</b></div>` +
      (n > 1 ? `<div class="ln tot"><span>Each of ${n}</span><b class="mono">${both(tot / n)}</b></div>` : '');
    $$('.sk').forEach(b => b.classList.toggle('on', +b.dataset.rate === state.salik));
    $$('.cp').forEach(b => b.classList.toggle('on', +b.dataset.n === state.split));
  }
  ['#route', '#customKm', '#eff', '#gates'].forEach(s => $(s).addEventListener('input', renderCommute));
  $$('.sk').forEach(b => b.onclick = () => { state.salik = +b.dataset.rate; store.set('salik', state.salik); renderCommute(); });
  $$('.cp').forEach(b => b.onclick = () => { state.split = +b.dataset.n; renderCommute(); });

  /* ---------- stations ---------- */
  function renderStations() {
    const g = state.geo, row = (title, q) => {
      const e = encodeURIComponent(q);
      return `<div class="stn"><span class="stn-n">${title}</span><span class="stn-l">
        <a class="chip" target="_blank" rel="noopener" aria-label="Open ${title} in Apple Maps" href="https://maps.apple.com/?q=${e}${g ? '&ll=' + g.lat + ',' + g.lng : ''}">Apple</a>
        <a class="chip" target="_blank" rel="noopener" aria-label="Open ${title} in Google Maps" href="${g ? `https://www.google.com/maps/search/${e}/@${g.lat},${g.lng},14z` : `https://www.google.com/maps/search/?api=1&query=${e}`}">Google</a>
        <a class="chip" target="_blank" rel="noopener" aria-label="Open ${title} in Waze" href="https://waze.com/ul?q=${e}${g ? '&ll=' + g.lat + ',' + g.lng : ''}&navigate=yes">Waze</a></span></div>`;
    }, area = $('#area').value;
    $('#stationsOut').innerHTML = row(`Fuel near ${area}`, 'fuel station near ' + area + ' Dubai') + row('ADNOC, Discovery Gardens', 'ADNOC Service Station Discovery Gardens Dubai') +
      row('ENOC, Jebel Ali Industrial', 'ENOC petrol station Jebel Ali Industrial Dubai') + row('Emarat, E11', 'Emarat petrol station E11 Sheikh Zayed Road Dubai');
  }
  $('#area').addEventListener('input', renderStations);

  /* ---------- live syncs ---------- */
  async function syncFx() {
    $('#fxPill').classList.add('loading');
    const r = await NewsFetcher.getRate();
    state.rate = r.rate; state.live = r.live; state.rateTime = r.t; store.set('rate', r.rate); refresh(); $('#fxPill').classList.remove('loading');
  }
  async function syncUae(manual) {
    const r = await NewsFetcher.syncUaePrices().catch(() => null);
    if (!r) { if (manual) toast('No new announcement found'); return; }
    r.prices.forEach((p, i) => { if (!state.prices.edited['uae' + i]) state.prices.uae[i][1] = p; });
    state.prices.month = r.month; state.prices.src = 'synced from news'; persistPrices(); refresh();
    if (manual) toast('UAE prices updated');
  }
  $('#syncPrices').onclick = () => busy($('#syncPrices'), () => syncUae(true));

  /* ---------- news ---------- */
  function renderNews() {
    const res = state.news, ul = $('#news'), c = state.cat; ul.classList.remove('fading'); $('#fallbackCards').classList.remove('fading'); ul.innerHTML = '';
    const items = res.items.filter(n => c === 'all' || n.cat === c);
    items.forEach((n, ix) => {
      const li = document.createElement('li'); li.className = 'fadein'; li.style.animationDelay = (ix * 40) + 'ms';
      const box = document.createElement('div'); box.className = 'nt';
      const a = document.createElement('a'); a.href = n.link; a.target = '_blank'; a.rel = 'noopener'; a.textContent = n.title + ' ';
      const ext = document.createElement('span'); ext.className = 'ext'; ext.setAttribute('aria-hidden', 'true'); ext.textContent = '↗'; a.append(ext);
      const s = document.createElement('small'); s.textContent = n.source + (n.date ? ' · ' + new Date(n.date).toLocaleDateString() : '');
      const b = document.createElement('button'); b.className = 'ic-btn'; b.textContent = '⤴'; b.setAttribute('aria-label', 'Share headline: ' + n.title); b.onclick = () => share(n.title, n.link);
      box.append(a, s); li.append(box, b); ul.append(li);
    });
    $('#newsStatus').textContent = res.fallback ? 'Live feeds unavailable right now. Showing official source links.'
      : !items.length ? 'No headlines in this category yet. See the official sources below.'
      : `Updated ${new Date(res.t).toLocaleTimeString()}${res.offline ? ' (saved copy, offline)' : ''}`;
    $('#fallbackCards').innerHTML = NewsFetcher.FALLBACK_CARDS.filter(f => c === 'all' || f.cat === c).map((f, ix) => `<a class="fadein" style="animation-delay:${ix * 40}ms" href="${f.url}" target="_blank" rel="noopener">${f.title} <span class="ext" aria-hidden="true">↗</span><small>${f.note}</small></a>`).join('');
    $$('.nf').forEach(b => b.classList.toggle('on', b.dataset.cat === c)); glide($('#newsFilters'));
  }
  async function loadNews(force) { $('#newsStatus').textContent = 'Loading…'; $('#news').innerHTML = '<li class="skel"></li><li class="skel"></li><li class="skel"></li>'; state.news = await NewsFetcher.load(force); renderNews(); if (state.news.offline && force) toast('Could not reach live news. Showing saved headlines.'); }
  $$('.nf').forEach(b => b.onclick = () => {
    state.cat = b.dataset.cat; $$('.nf').forEach(x => x.classList.toggle('on', x === b)); glide($('#newsFilters'));
    if (!motionOK()) return renderNews();
    $('#news').classList.add('fading'); $('#fallbackCards').classList.add('fading'); setTimeout(renderNews, 120);   // fade out, then staggered fade in
  });
  $('#refreshNews').onclick = () => busy($('#refreshNews'), () => loadNews(true));

  /* ---------- sharing ---------- */
  async function share(text, url = configUrl()) {
    try {
      if (navigator.share) return await navigator.share({ title: 'Dubai Fuel Monitor', text, url });
      await navigator.clipboard.writeText(`${text}\n${url}`); toast('Copied to clipboard');
    } catch (e) { if (e.name !== 'AbortError') toast('Could not share'); }
  }
  $('#shareBtn').onclick = () => { const a = active(); share(`Dubai fuel (${monthLabel(state.prices.month)}): ${a.name} ${fmt(a.price)} AED/L ≈ ${fmt(a.price * state.rate)} PHP/L. ${LT()}L = ${fmt(a.price * state.liters)} AED ≈ ${fmt(a.price * state.liters * state.rate, 0)} PHP. 1 AED = ${fmt(state.rate, 3)} PHP.`); };
  $('#waBtn').onclick = () => {
    const a = active(), r = state.rate, L = state.liters;
    const t = `⛽ Dubai Fuel Update (${monthLabel(state.prices.month)}): ${a.name}: ${fmt(a.price)} AED/L (₱${fmt(a.price * r)}/L) | PH ${a.phName}: ₱${fmt(a.phPrice)}/L.\n${LT()}L fill-up: ${fmt(a.price * L)} AED (~₱${fmt(a.price * L * r, 0)}).\nCompare here: ${configUrl()}`;
    window.open('https://wa.me/?text=' + encodeURIComponent(t), '_blank', 'noopener');
  };

  /* ---------- story card (canvas) ---------- */
  let storyBlob = null;
  const THEMES = {
    obsidian: { bg: ['#16213a', '#05070c'], text: '#f2f5fa', mute: '#9aa7bd', accent: '#f5b83d', panel: 'rgba(255,255,255,.07)', good: '#3ddc97', bad: '#ff6b6b' },
    adnoc: { bg: ['#0b3a9c', '#051d52'], text: '#ffffff', mute: '#b9c8ee', accent: '#f2b705', panel: 'rgba(255,255,255,.12)', good: '#7dffb2', bad: '#ffb0b0' },
    ofw: { bg: ['#fbf8f1', '#efe8d8'], text: '#14213d', mute: '#5b6477', accent: '#c8102e', panel: 'rgba(20,33,61,.07)', good: '#0a7d4f', bad: '#b3261e' }
  };
  function drawStory() {
    const W = 1080, H = 1920, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    const F = '"Inter", system-ui, -apple-system, sans-serif', r = state.rate, T = THEMES[state.storyTheme] || THEMES.obsidian;
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, T.bg[0]); g.addColorStop(1, T.bg[1]); x.fillStyle = g; x.fillRect(0, 0, W, H);
    const rr = (a, b, w, h, rad, fill) => { x.beginPath(); x.roundRect ? x.roundRect(a, b, w, h, rad) : x.rect(a, b, w, h); x.fillStyle = fill; x.fill(); };
    const t = (s, px, y, col, wt = 700, al = 'center', xx = W / 2) => { x.textAlign = al; x.fillStyle = col; x.font = `${wt} ${px}px ${F}`; x.fillText(s, xx, y); };
    t('⛽ Dubai Fuel Monitor', 84, 190, T.accent, 800);
    t(new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), 44, 270, T.text, 600);
    if (state.storyTheme === 'ofw') {                     // minimalist remittance comparison
      const a = active(), tank = a.price * state.liters, per = a.price * r, d = (per - a.phPrice) / a.phPrice * 100;
      rr(90, 360, 900, 560, 40, T.panel);
      t(`One full ${LT()} L tank of ${a.name}`, 44, 450, T.mute, 600); t(`₱${fmt(tank * r, 0)}`, 170, 640, T.accent, 800);
      t(`${fmt(tank)} AED`, 64, 740, T.text, 700); t(`1 AED = ${fmt(r, 3)} PHP`, 36, 830, T.mute, 500);
      rr(90, 970, 900, 520, 40, T.panel); t('Per litre, in pesos', 40, 1050, T.mute, 600);
      t(`🇦🇪 ₱${fmt(per)}`, 80, 1190, T.text, 800); t(`🇵🇭 ₱${fmt(a.phPrice)}`, 80, 1330, T.text, 800);
      t(`${d > 0 ? '+' : ''}${fmt(d, 1)}% UAE vs Philippines`, 44, 1440, d <= 0 ? T.good : T.bad, 800);
      t(`Saving this tank means about ₱${fmt(tank * r, 0)} you can send home.`, 34, 1580, T.text, 500);
    } else {
      rr(90, 330, 900, 150, 30, T.panel); t(`1 AED = ${fmt(r, 3)} PHP`, 58, 425, T.text, 700);
      t(state.live ? 'Live exchange rate' : 'Cached exchange rate', 30, 468, T.mute, 500); t('UAE vs Philippines · per litre', 34, 580, T.mute, 700);
      state.prices.uae.forEach(([name, p], i) => {
        const y = 620 + i * 280, php = state.prices.ph[i][1], d = (p * r - php) / php * 100;
        rr(70, y, 940, 250, 36, T.panel);
        t(`${name} vs ${state.prices.ph[i][0]}`, 44, y + 70, T.accent, 800, 'left', 110);
        t(`🇦🇪 ${fmt(p)} AED`, 52, y + 150, T.text, 700, 'left', 110); t(`≈ ₱${fmt(p * r)}`, 32, y + 200, T.mute, 500, 'left', 110);
        t(`🇵🇭 ₱${fmt(php)}`, 52, y + 150, T.text, 700, 'left', 560);
        t(`${d > 0 ? '+' : ''}${fmt(d, 1)}%`, 44, y + 70, d <= 0 ? T.good : T.bad, 800, 'right', 970);
      });
    }
    t(PH_NOTE + ' · % = UAE vs PH', 28, 1780, T.mute, 500); t(APP_URL.replace('https://', ''), 34, 1850, T.accent, 700);
    return new Promise(res => c.toBlob(b => res(b), 'image/png'));
  }
  let storyFile = null, storyUrl = '', storyCanShare = false, storyTimer = 0;
  function scheduleStory(delay = 400) {          // re-render in the background after prices / slider / FX change
    clearTimeout(storyTimer); $('#storyShare').disabled = true;
    storyTimer = setTimeout(async () => {
      const b = await drawStory(); if (!b) return;
      storyBlob = b; storyFile = new File([b], 'dubai-fuel-story.png', { type: 'image/png' });
      try { storyCanShare = !!(navigator.canShare && navigator.canShare({ files: [storyFile] })); } catch (_) { storyCanShare = false; }
      $('#storyShare').disabled = false; const old = storyUrl; storyUrl = URL.createObjectURL(b);
      if (!$('#storyModal').hidden) $('#storyImg').src = storyUrl;
      if (old) setTimeout(() => URL.revokeObjectURL(old), 2000);
    }, delay);
  }
  $('#storyBtn').onclick = () => {
    if (!storyUrl) { scheduleStory(0); return toast('Preparing the story card… tap again in a second'); }
    $('#storyImg').src = storyUrl; $('#storyModal').hidden = false;
    const w = $('#sheenWrap'); w.classList.remove('play'); void w.offsetWidth; w.classList.add('play'); confetti();
  };
  $$('.th').forEach(b => { b.classList.toggle('on', b.dataset.t === state.storyTheme); b.onclick = () => { state.storyTheme = b.dataset.t; store.set('storyTheme', state.storyTheme); $$('.th').forEach(x => x.classList.toggle('on', x === b)); scheduleStory(0); }; });
  $('#storyClose').onclick = () => { $('#storyModal').hidden = true; };
  $('#storyDl').onclick = () => { if (!storyUrl) return; const a = document.createElement('a'); a.href = storyUrl; a.download = 'dubai-fuel-story.png'; document.body.appendChild(a); a.click(); a.remove(); };
  // navigator.share is called synchronously from the tap, with the already-built file, so iOS keeps user activation.
  $('#storyShare').onclick = () => {
    if (!storyFile) return toast('Still preparing, try again');
    if (!storyCanShare) return toast('Image sharing is not supported here. Use Download.');
    navigator.share({ files: [storyFile], title: 'Dubai Fuel Monitor', text: APP_URL }).catch(e => { if (e.name !== 'AbortError') toast('Could not share'); });
  };

  /* ---------- install + iOS sheet ---------- */
  let deferred;
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; if (!store.get('installDismissed', false)) $('#installBar').hidden = false; });
  $('#installBtn').onclick = async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; $('#installBar').hidden = true; };
  $('#installClose').onclick = () => { $('#installBar').hidden = true; store.set('installDismissed', true); };
  addEventListener('appinstalled', () => { $('#installBar').hidden = true; toast('Installed'); });
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  const sheet = open => { $('#iosModal').hidden = !open; };
  $('#helpBtn').onclick = () => sheet(true);
  $('#installHow').onclick = async () => { if (deferred) { deferred.prompt(); await deferred.userChoice; deferred = null; } else sheet(true); };
  $('#iosGot').onclick = () => sheet(false);
  $('#iosHide').onclick = () => { store.set('iosHide', true); store.set('iosBannerHide', true); $('#iosBanner').hidden = true; sheet(false); toast('You can reopen this from the ? button'); };
  $('#iosModal').addEventListener('click', e => { if (e.target.id === 'iosModal') sheet(false); });
  $('#storyModal').addEventListener('click', e => { if (e.target.id === 'storyModal') $('#storyModal').hidden = true; });
  addEventListener('keydown', e => { if (e.key === 'Escape') { sheet(false); $('#storyModal').hidden = true; } });
  const iosSafari = isIOS && /safari/i.test(navigator.userAgent) && !/crios|fxios|edgios|opios/i.test(navigator.userAgent);
  if (iosSafari && !standalone && !store.get('iosBannerHide', false)) $('#iosBanner').hidden = false;
  $('#iosBannerHow').onclick = () => sheet(true);
  $('#iosBannerClose').onclick = () => { $('#iosBanner').hidden = true; store.set('iosBannerHide', true); };

  /* ---------- slider, presets ---------- */
  let animId = 0;
  function applyLiters(v) {
    state.cash = null;
    state.liters = v; $('#vol').value = v; $('#volOut').textContent = v; store.set('liters', v);
    $$('.vp').forEach(b => b.classList.toggle('on', +b.dataset.v === v)); refresh(); glide($('#vpresets'));
  }
  function animateTo(target) {
    const id = ++animId, from = state.liters;
    if (from === target || state.mode === 'battery' || matchMedia('(prefers-reduced-motion: reduce)').matches) return applyLiters(target);
    state.animating = true;
    const t0 = performance.now(), step = t => {
      if (id !== animId) { state.animating = false; return; }
      const p = Math.min(1, (t - t0) / 300), e = 1 - Math.pow(1 - p, 3);
      if (p >= 1) state.animating = false;
      applyLiters(Math.round(from + (target - from) * e)); if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  $('#vol').oninput = e => { animId++; state.animating = false; applyLiters(+e.target.value); };
  $$('.vp').forEach(b => b.onclick = () => { buzz(); animateTo(+b.dataset.v); });
  $('#strip').addEventListener('click', e => { const t = e.target.closest('.gt'); if (!t) return; buzz(); state.grade = +t.dataset.g; store.set('grade', state.grade); refresh(); });
  $('#cashReset').onclick = () => { buzz(); state.cash = null; animateTo(Math.round(state.prev) || 67); };
  const cbPre = ['0', '2', '5', '7.5', '10'].includes(String(state.cb)); $('#cbSel').value = cbPre ? String(state.cb) : 'custom'; $('#cbCustom').hidden = cbPre; if (!cbPre) $('#cbCustom').value = state.cb;
  $('#cbSel').onchange = e => { if (e.target.value === 'custom') { $('#cbCustom').hidden = false; $('#cbCustom').focus(); return; } $('#cbCustom').hidden = true; state.cb = +e.target.value; store.set('cb', state.cb); renderRewards(); };
  $('#cbCustom').addEventListener('input', e => { state.cb = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)); store.set('cb', state.cb); renderRewards(); });

  /* ---------- inputs ---------- */
  const amt = $('#amt'); amt.removeAttribute('pattern'); amt.setAttribute('inputmode', 'decimal'); amt.step = 'any'; amt.min = 0;
  [amt, $('#budget'), $('#customKm'), $('#logOdo'), $('#logL'), $('#logAed'), $('#cbCustom')].forEach(el => el.addEventListener('input', () => { if (parseFloat(el.value) < 0) el.value = 0; }));
  amt.addEventListener('input', renderConverter);
  $('#budget').value = store.get('budget', 1000);
  $('#budget').addEventListener('input', () => { store.set('budget', num($('#budget'))); renderBudget(); renderTip(); });
  $('#dirBtn').onclick = () => { state.dir = state.dir === 'AED2PHP' ? 'PHP2AED' : 'AED2PHP'; store.set('dir', state.dir); renderConverter(); };
  $$('.seg[data-mode]').forEach(b => b.onclick = () => { buzz(); vt(() => applyMode(b.dataset.mode)); });

  /* ---------- pull to refresh (elastic, fuel-drop) ---------- */
  let y0 = null, pulled = 0, refreshing = false;
  const ptr = $('#ptr'), drop = ptr.firstElementChild;
  addEventListener('touchstart', e => { y0 = (scrollY <= 0 && !refreshing && !(e.target.closest && e.target.closest('input,select,.vpresets,#spark,#newsFilters'))) ? e.touches[0].clientY : null; pulled = 0; }, { passive: true });
  addEventListener('touchmove', e => {
    if (y0 === null) return; const dy = e.touches[0].clientY - y0;
    if (dy <= 0) { ptr.style.transform = ''; return; }
    pulled = dy; ptr.style.transition = 'none';
    ptr.style.transform = `translate(-50%, ${Math.min(72, dy * .55) - 60}px)`; drop.style.transform = `rotate(${dy * 3}deg)`; ptr.classList.toggle('ready', dy >= 65);
  }, { passive: true });
  addEventListener('touchend', async () => {
    if (y0 === null) return; y0 = null; ptr.style.transition = '';
    if (pulled >= 65) {
      refreshing = true; buzz(); ptr.classList.add('spin'); ptr.style.transform = 'translate(-50%, 14px)'; drop.style.transform = '';
      await Promise.allSettled([syncFx(), syncUae(false), loadNews(true)]);
      ptr.classList.remove('spin', 'ready'); ptr.style.transform = ''; refreshing = false;
    } else { ptr.classList.remove('ready'); ptr.style.transform = ''; drop.style.transform = ''; }
    pulled = 0;
  });
  const refreshAll = () => Promise.allSettled([syncFx(), syncUae(false), loadNews(true)]);

  /* ---------- 27-item features ---------- */
  const vt = fn => (document.startViewTransition && motionOK()) ? document.startViewTransition(fn) : fn();
  const idb = (() => {
    let dbp; const open = () => dbp || (dbp = new Promise((res, rej) => { const r = indexedDB.open('dubaifuel', 1); r.onupgradeneeded = () => r.result.createObjectStore('fills', { keyPath: 'id', autoIncrement: true }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
    const tx = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction('fills', mode), rq = fn(t.objectStore('fills')); t.oncomplete = () => res(rq && rq.result); t.onerror = () => rej(t.error); }); };
    return { all: () => tx('readonly', s => s.getAll()), add: v => tx('readwrite', s => s.add(v)), clear: () => tx('readwrite', s => s.clear()) };
  })();
  async function refreshLog() {
    let rows = []; try { rows = (await idb.all()) || []; } catch (_) {}
    rows.sort((x, y) => x.odo - y.odo);
    const now = new Date(), ms = rows.filter(r => { const d = new Date(r.t); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); });
    const spent = ms.reduce((s, r) => s + r.aed, 0), b = num($('#budget')), pct = b ? Math.min(100, spent / b * 100) : 0;
    $('#bfill').style.width = pct + '%'; $('#bfill').classList.toggle('over', !!b && spent > b);
    $('#bnote').textContent = ms.length ? `Logged this month: ${fmt(spent)} AED of ${fmt(b, 0)} AED (${fmt(b ? spent / b * 100 : 0, 0)}%) across ${ms.length} fill-up${ms.length === 1 ? '' : 's'}.` : 'No fill-ups logged this month yet.';
    const eff = []; for (let i = 1; i < rows.length; i++) { const d = rows[i].odo - rows[i - 1].odo; if (d > 0 && rows[i].liters > 0) eff.push(d / rows[i].liters); }
    $('#logSummary').textContent = eff.length ? `Average real economy: ${fmt(eff.reduce((s, v) => s + v, 0) / eff.length, 1)} km/L over ${eff.length} fill-up${eff.length === 1 ? '' : 's'}.` : 'Log at least two full-tank fills to see your real km/L.';
    $('#logList').innerHTML = rows.slice(-5).reverse().map(r => `<div class="ln"><span>${new Date(r.t).toLocaleDateString('en-GB')} · ${fmt(r.odo, 0)} km</span><b class="mono">${fmt(r.liters)} L · ${fmt(r.aed)} AED</b></div>`).join('');
  }
  $('#logSave').onclick = async () => {
    const odo = num($('#logOdo')), liters = num($('#logL')), aed = num($('#logAed')); if (!odo || !liters || !aed) return toast('Enter odometer, litres and AED paid');
    try { await idb.add({ t: Date.now(), odo, liters, aed }); ['#logOdo', '#logL', '#logAed'].forEach(s => { $(s).value = ''; }); toast('Fill-up saved'); refreshLog(); } catch (_) { toast('Could not save on this device'); }
  };
  $('#logClear').onclick = async () => { if (!confirm('Clear all logged fill-ups on this device?')) return; try { await idb.clear(); } catch (_) {} refreshLog(); };
  $('#logFill').onclick = () => {
    const a = active(); $('#logL').value = Math.round(state.liters * 100) / 100; $('#logAed').value = Math.round(a.price * state.liters * 100) / 100;
    const acc = $('#logAcc'); if (!acc.classList.contains('open')) acc.querySelector('.acc-h').click(); $('#logOdo').focus();
  };
  $('#geoBtn').onclick = () => {
    if (!navigator.geolocation) return toast('Location is not available on this device');
    $('#geoNote').textContent = 'Finding you…';
    return busy($('#geoBtn'), () => new Promise(done => navigator.geolocation.getCurrentPosition(p => {
      state.geo = { lat: +p.coords.latitude.toFixed(4), lng: +p.coords.longitude.toFixed(4) }; $('#geoNote').textContent = 'Map links now search near you.'; renderStations(); toast('Location found'); done();
    }, () => { $('#geoNote').textContent = 'Location is off. Allow it in your browser settings to use this.'; toast('Could not get your location'); done(); }, { timeout: 8000, maximumAge: 60000 })));
  };
  $('#icsBtn').onclick = () => {
    const d = new Date(), p = n => String(n).padStart(2, '0'); let last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    if (last < new Date(d.getFullYear(), d.getMonth(), d.getDate())) last = new Date(d.getFullYear(), d.getMonth() + 2, 0);
    const ds = `${last.getFullYear()}${p(last.getMonth() + 1)}${p(last.getDate())}`;
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Dubai Fuel Monitor//EN', 'BEGIN:VEVENT', `UID:dubaifuel-${ds}@esp046-cyber.github.io`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
      `DTSTART;VALUE=DATE:${ds}`, 'RRULE:FREQ=MONTHLY;BYMONTHDAY=-1', 'SUMMARY:UAE fuel prices announced for next month', 'DESCRIPTION:The UAE Fuel Price Committee usually announces next month’s prices around month end. Open Dubai Fuel Monitor to compare.',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:UAE fuel price announcement', 'TRIGGER;RELATED=START:-PT15H', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })), l = document.createElement('a'); l.href = url; l.download = 'dubai-fuel-reminder.ics'; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('Reminder file created');
  };
  $('#copyBtn').onclick = async () => {
    const a = active(), r = state.rate, items = state.addons.filter(k => ADDONS[k]);
    const txt = [`Fuel receipt · ${new Date().toLocaleDateString('en-GB')}`, `${a.name}: ${LT()} L × ${fmt(a.price)} AED/L = ${fmt(a.price * state.liters)} AED`, ...items.map(k => `${ADDONS[k][0]}: ${fmt(ADDONS[k][1])} AED`),
      `Total: ${fmt(state.total)} AED (≈ ₱${fmt(state.total * r, 0)} at 1 AED = ${fmt(r, 3)} PHP)`].join('\n');
    try { await navigator.clipboard.writeText(txt); } catch (_) { const t = document.createElement('textarea'); t.value = txt; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch (__) {} t.remove(); }
    buzz(); toast('Receipt copied');
  };
  function renderCar() {
    const car = store.get('car', null), box = $('#carChip'); box.innerHTML = ''; if (!car) return;
    const b = document.createElement('button'); b.className = 'chip'; b.textContent = `🚗 ${car.name} · ${car.liters} L`; b.onclick = () => { buzz(); animateTo(car.liters); };
    const x = document.createElement('button'); x.className = 'chip'; x.textContent = '✕'; x.setAttribute('aria-label', 'Remove saved car'); x.onclick = () => { if (!confirm('Remove your saved car?')) return; store.set('car', null); renderCar(); toast('Saved car removed'); };
    box.append(b, x);
  }
  $('#carSave').onclick = () => { store.set('car', { name: $('#carName').value.trim() || 'My car', liters: Math.round(state.liters) }); renderCar(); toast('Saved as your default tank'); };
  function renderMini() {
    const a = active(), r = state.rate, t = state.total;
    $('#miniBar').textContent = `${LT()} L · ${a.name} · ` + (state.primary === 'AED' ? `${fmt(t)} AED (₱${fmt(t * r, 0)})` : `₱${fmt(t * r, 0)} (${fmt(t)} AED)`);
  }
  function initMini() {                                  // scroll check (works when the nav jumps past the calculator)
    const calc = $('#calc'), bar = $('#miniBar'); let t = false;
    const upd = () => { t = false; bar.hidden = !(calc.getBoundingClientRect().bottom < 0); };
    addEventListener('scroll', () => { if (!t) { t = true; requestAnimationFrame(upd); } }, { passive: true }); addEventListener('resize', upd); upd();
  }

  /* ---------- navigation: bottom bar (mobile) / top bar (desktop) ---------- */
  async function busy(btn, fn) {                         // loading state + no double runs
    if (btn.classList.contains('loading')) return;
    btn.classList.add('loading'); btn.setAttribute('aria-busy', 'true');
    try { return await fn(); } finally { btn.classList.remove('loading'); btn.removeAttribute('aria-busy'); }
  }
  let lastBtn = null, lastT = 0;
  document.addEventListener('click', e => {              // ignore accidental double taps on action buttons
    const b = e.target.closest('.btn'); if (!b) return; const now = Date.now();
    if (b === lastBtn && now - lastT < 450) { e.stopImmediatePropagation(); e.preventDefault(); return; }
    lastBtn = b; lastT = now;
  }, true);
  function initNav() {
    const SECS = ['home', 'fuel', 'tools', 'stations', 'more'], links = $$('#bottomNav [data-nav]');
    const off = () => (matchMedia('(min-width: 768px)').matches ? 116 : 56), url = id => location.pathname + location.search + '#' + id;
    let locked = false, lockT = 0, ticking = false;
    const lock = () => { locked = true; clearTimeout(lockT); lockT = setTimeout(() => { locked = false; spy(); }, 900); };
    function setActive(id, replace = true) {
      links.forEach(l => { const on = l.dataset.nav === id; l.classList.toggle('on', on); if (on) l.setAttribute('aria-current', 'location'); else l.removeAttribute('aria-current'); });
      store.set('navSec', id); if (replace && location.hash !== '#' + id) history.replaceState(null, '', url(id));
    }
    function goTo(el, smooth = true) {
      if (!el) return; const beh = smooth && motionOK() ? 'smooth' : 'auto';
      if (el.id === 'home') scrollTo({ top: 0, behavior: beh }); else el.scrollIntoView({ behavior: beh, block: 'start' });
    }
    links.forEach(l => l.addEventListener('click', e => {
      e.preventDefault(); buzz(); const id = l.dataset.nav; lock(); setActive(id, false);
      if (location.hash !== '#' + id) history.pushState(null, '', url(id)); goTo(document.getElementById(id));
    }));
    document.addEventListener('click', e => {            // quick-access buttons jump to a card (and open it if collapsed)
      const b = e.target.closest('[data-go]'); if (!b) return; buzz(); const el = document.getElementById(b.dataset.go); if (!el) return;
      if (el.classList.contains('acc') && !el.classList.contains('open')) el.querySelector('.acc-h').click();
      const s = el.closest('.sec'); lock(); if (s) { setActive(s.id, false); history.pushState(null, '', url(s.id)); } goTo(el);
    });
    function spy() {
      ticking = false; if (locked) return; let cur = SECS[0];
      for (const id of SECS) if (document.getElementById(id).getBoundingClientRect().top <= off()) cur = id;
      if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) cur = SECS[SECS.length - 1];
      if (!links.some(l => l.dataset.nav === cur && l.classList.contains('on'))) setActive(cur);
    }
    addEventListener('scroll', () => { $('#toTop').hidden = scrollY < 700; if (!ticking) { ticking = true; requestAnimationFrame(spy); } }, { passive: true });
    $('#toTop').onclick = () => { buzz(); lock(); setActive('home', false); history.replaceState(null, '', url('home')); scrollTo({ top: 0, behavior: motionOK() ? 'smooth' : 'auto' }); };
    addEventListener('popstate', () => { const id = location.hash.slice(1); if (SECS.includes(id)) { lock(); setActive(id, false); goTo(document.getElementById(id)); } });
    const h = location.hash.slice(1), start = SECS.includes(h) ? h : store.get('navSec', 'home');
    setActive(SECS.includes(start) ? start : 'home', false);
    if (SECS.includes(start) && start !== 'home') { const run = () => goTo(document.getElementById(start), false); setTimeout(run, 350); if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => setTimeout(run, 60)); }
  }

  /* ---------- micro-interactions ---------- */
  const motionOK = () => !(state.mode === 'battery' || matchMedia('(prefers-reduced-motion: reduce)').matches);
  const rolled = {};
  function rollNums(scope, instant) {                    // 250ms count up/down for currency and litre figures
    $$(scope + ' [data-roll]').forEach(el => {
      const key = el.dataset.roll, to = +el.dataset.to, d = +(el.dataset.d || 0), from = rolled[key] === undefined ? to : rolled[key];
      const draw = v => { el.textContent = fmt(v, d); };
      cancelAnimationFrame(rolled['raf' + key]);
      if (instant || !motionOK() || from === to) { draw(to); rolled[key] = to; return; }
      draw(from); const t0 = performance.now();
      const step = t => { const p = Math.min(1, (t - t0) / 250), v = from + (to - from) * (1 - Math.pow(1 - p, 3)); draw(v); rolled[key] = p < 1 ? v : to; if (p < 1) rolled['raf' + key] = requestAnimationFrame(step); };
      rolled['raf' + key] = requestAnimationFrame(step);
    });
  }
  function glide(box) {                                  // spring-sliding active indicator behind pills
    const ind = box && box.querySelector('.glide-ind'), on = box && box.querySelector('.on'); if (!ind) return; if (!on) { ind.style.opacity = 0; return; } ind.style.opacity = 1;
    const first = !ind.dataset.ready; if (first) ind.style.transition = 'none';
    ind.style.width = on.offsetWidth + 'px'; ind.style.height = on.offsetHeight + 'px'; ind.style.transform = `translate(${on.offsetLeft}px, ${on.offsetTop}px)`;
    if (first) requestAnimationFrame(() => { ind.style.transition = ''; ind.dataset.ready = 1; });
    if (box.scrollWidth > box.clientWidth) box.scrollTo({ left: on.offsetLeft - (box.clientWidth - on.offsetWidth) / 2, behavior: motionOK() ? 'smooth' : 'auto' });
  }
  const TANK_COL = ['#f5b83d', '#22d3ee', '#10b981', '#94a3b8'];   // Super 98 gold, Special 95 cyan, E-Plus 91 emerald, Diesel slate
  function renderTank() {
    const f = $('#tankFill'); f.style.transform = `scaleX(${state.liters / 140})`; f.style.setProperty('--fill', TANK_COL[state.grade]);
    $('#tankLbl').textContent = `${LT()} L · ${active().name}`;
  }
  function ripple(btn, e) {
    if (!motionOK()) return; const r = btn.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2, s = document.createElement('span');
    const x = e && e.clientX ? e.clientX - r.left : r.width / 2, y = e && e.clientY ? e.clientY - r.top : r.height / 2;
    s.className = 'ripple'; s.style.cssText = `width:${d}px;height:${d}px;left:${x - d / 2}px;top:${y - d / 2}px`; btn.appendChild(s); setTimeout(() => s.remove(), 600);
  }
  function confetti() {
    if (!motionOK()) return; const box = $('#confetti'); box.innerHTML = '';
    for (let i = 0; i < 16; i++) {
      const p = document.createElement('i'); p.style.cssText = `left:${10 + Math.random() * 80}%;background:${['#f5b83d', '#22d3ee', '#3ddc97', '#fff'][i % 4]};--dx:${(Math.random() - .5) * 120}px;animation-delay:${Math.random() * 150}ms`; box.appendChild(p);
    }
    setTimeout(() => { box.innerHTML = ''; }, 1300);
  }
  function initSparkScrub() {                            // touch / hover tooltip with the exact monthly rate
    const box = $('#spark'), svg = box.querySelector('svg'); if (!svg) return;
    const W = 320, H = 96, p = 10, all = [...HISTORY.s98, ...HISTORY.s95], lo = Math.min(...all) - .05, hi = Math.max(...all) + .05;
    const X = i => p + i * (W - 2 * p) / 5, Y = v => H - p - (v - lo) / (hi - lo) * (H - 2 * p), NS = 'http://www.w3.org/2000/svg';
    const g = document.createElementNS(NS, 'line'); g.setAttribute('y1', 0); g.setAttribute('y2', H); g.setAttribute('stroke', 'var(--muted)'); g.setAttribute('stroke-dasharray', '3 3'); g.setAttribute('opacity', 0); svg.appendChild(g);
    const mk = col => { const c = document.createElementNS(NS, 'circle'); c.setAttribute('r', 6); c.setAttribute('fill', col); c.setAttribute('stroke', 'var(--bg)'); c.setAttribute('stroke-width', 2); c.setAttribute('opacity', 0); svg.appendChild(c); return c; };
    const d98 = mk('var(--accent)'), d95 = mk('var(--muted)'), tip = document.createElement('div'); tip.className = 'spark-tip'; tip.hidden = true; box.appendChild(tip);
    let hideT = 0;
    const show = e => {
      const rc = svg.getBoundingClientRect(), x = (e.clientX - rc.left) / rc.width * W, i = Math.max(0, Math.min(5, Math.round((x - p) / ((W - 2 * p) / 5))));
      g.setAttribute('x1', X(i)); g.setAttribute('x2', X(i)); g.setAttribute('opacity', .6);
      d98.setAttribute('cx', X(i)); d98.setAttribute('cy', Y(HISTORY.s98[i])); d98.setAttribute('opacity', 1); d95.setAttribute('cx', X(i)); d95.setAttribute('cy', Y(HISTORY.s95[i])); d95.setAttribute('opacity', 1);
      tip.textContent = `${HISTORY.labels[i]} 2026: Super 98 ${fmt(HISTORY.s98[i])} · Special 95 ${fmt(HISTORY.s95[i])} AED/L`; tip.hidden = false;
      const px = X(i) / W * rc.width; tip.style.left = Math.max(tip.offsetWidth / 2, Math.min(rc.width - tip.offsetWidth / 2, px)) + 'px';
      clearTimeout(hideT); hideT = setTimeout(hide, 2500);
    };
    const hide = () => { tip.hidden = true; g.setAttribute('opacity', 0); d98.setAttribute('opacity', 0); d95.setAttribute('opacity', 0); };
    box.style.touchAction = 'pan-y';
    box.addEventListener('pointerdown', e => { try { box.setPointerCapture(e.pointerId); } catch (_) {} show(e); });
    box.addEventListener('pointermove', show); box.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hide(); });
  }
  function initAcc() {                                   // grid-template-rows 0fr -> 1fr accordions
    $$('.acc-h').forEach(h => h.onclick = () => { const open = h.closest('.acc').classList.toggle('open'); h.setAttribute('aria-expanded', open); buzz(); });
  }
  function initUpdateToast() {                           // slide-up pill when a new service worker takes over
    const pill = $('#updatePill'), had = !!(navigator.serviceWorker && navigator.serviceWorker.controller); let reg = null;
    pill.textContent = `App updated to ${APP_VERSION} — Tap to reload`;
    const show = () => { pill.hidden = false; requestAnimationFrame(() => pill.classList.add('show')); };
    pill.onclick = () => { if (reg && reg.waiting) { reg.waiting.postMessage('SKIP_WAITING'); setTimeout(() => location.reload(), 300); } else location.reload(); };
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (had) show(); });
    addEventListener('load', () => navigator.serviceWorker.register('./sw.js').then(r => {
      reg = r; if (r.waiting && navigator.serviceWorker.controller) show();
      r.addEventListener('updatefound', () => { const w = r.installing; if (w) w.addEventListener('statechange', () => { if (w.state === 'installed' && r.waiting && navigator.serviceWorker.controller) show(); }); });
      setInterval(() => r.update().catch(() => {}), 60 * 60 * 1000);
    }).catch(() => {}));
  }

  /* ---------- render everything ---------- */
  function refresh() {
    if (state.cash) {                                    // cash mode: the cash amount sets the litres
      const aed = state.cash.cur === 'AED' ? state.cash.amt : state.cash.amt / state.rate;
      state.liters = Math.round(aed / active().price * 100) / 100; $('#vol').value = Math.min(140, Math.max(10, Math.round(state.liters))); $('#volOut').textContent = LT();
    }
    $$('.vp').forEach(b => b.classList.toggle('on', !state.cash && +b.dataset.v === state.liters)); glide($('#vpresets'));
    renderStrip(); renderConverter(); renderMatrix(); renderRewards(); renderStop(); renderQuick(); renderBudget(); renderCommute(); renderTank(); renderMini(); scheduleStory(); }

  applyMode(state.mode);
  $$('[data-prim]').forEach(b => b.classList.toggle('on', b.dataset.prim === state.primary));
  applyLiters(state.liters); renderSpark(); renderTrackers(); renderTip(); renderStations(); loadNews(false);
  initSparkScrub(); initAcc(); initUpdateToast(); initMini(); renderCar(); refreshLog(); initNav();
  addEventListener('resize', () => { glide($('#vpresets')); glide($('#newsFilters')); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { glide($('#vpresets')); glide($('#newsFilters')); });
  syncFx(); syncUae(false);
  setInterval(syncFx, 15 * 60 * 1000); setInterval(() => syncUae(false), 6 * 60 * 60 * 1000);
  setInterval(() => { renderFx(); renderTrackers(); }, 30000);
  addEventListener('online', refreshAll); addEventListener('offline', renderFx);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { syncFx(); renderTrackers(); } });
})();
