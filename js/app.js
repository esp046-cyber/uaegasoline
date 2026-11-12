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
    month: '2026-11',
    uae: [['Super 98', 4.16], ['Special 95', 4.04], ['E-Plus 91', 3.97], ['Diesel', 4.75]],
    ph:  [['RON 100 / Blaze', 68.00], ['RON 95 / Premium Unleaded', 58.15], ['RON 91 / Regular Unleaded', 56.65], ['Diesel', 56.75]]
  };
  /* Official UAE Fuel Price Committee prices, AED/L. */
  const HISTORY = { labels: ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'], s98: [3.95, 3.40, 3.60, 3.80, 4.40, 4.16], s95: [3.83, 3.29, 3.49, 3.69, 4.28, 4.04] };
  const ADDONS = { coffee: ['Oasis Coffee', 12], manual: ['Manual Wash', 40], auto: ['Auto Wash', 30] };
  const clone = o => JSON.parse(JSON.stringify(o));
  const saved = store.get('prices.v2', null);
  const state = {
    rate: store.get('rate', 15.8), live: false, rateTime: 0,
    dir: store.get('dir', 'AED2PHP'), liters: store.get('liters', 67), grade: store.get('grade', 0),
    mode: store.get('mode', 'standard'), primary: store.get('primary', 'AED'), cb: store.get('cb', 0),
    addons: store.get('addons', []), salik: store.get('salik', 4), split: 1, qb: { cur: 'AED', amt: 50 }, cat: 'all',
    news: { items: [], t: 0 }, prices: saved || { ...clone(BASELINE), edited: {}, src: 'official baseline' }
  };
  const persistPrices = () => store.set('prices.v2', state.prices);
  const fmt = (n, d = 2) => Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
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
    } else { $('#fxText').textContent = `Cached FX: 1 AED = ${fmt(state.rate, 3)} PHP`; $('#fxAge').textContent = ''; }
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
    if (store.get('tipHide', false)) return;
    const b = store.get('budget', 1000), save = b * 0.05;
    $('#tipText').textContent = `Rough guides: heavy A/C use in summer heat can cut fuel economy by around 10–25% on short trips, idling with the A/C running gets 0 km per litre, and tyres about 10 psi under-pressure can add roughly 2% to fuel use. Example: a 5% saving on a ${fmt(b, 0)} AED monthly fuel budget is about ${fmt(save, 0)} AED (≈ ₱${fmt(save * state.rate, 0)}) a month. Check tyre pressure when cold, park in shade, vent hot air before turning on the A/C, and avoid long idling.`;
    $('#tipBanner').hidden = false;
  }
  $('#tipClose').onclick = () => { store.set('tipHide', true); $('#tipBanner').hidden = true; };

  /* ---------- matrix (table + cards) ---------- */
  function renderMatrix() {
    const L = state.liters, r = state.rate, { uae, ph, edited } = state.prices, P = state.primary;
    let h = `<tr><th>Grade (UAE / PH)</th><th>UAE AED/L</th><th>UAE PHP/L</th><th>PH PHP/L</th><th>UAE ${L}L</th><th>PH ${L}L</th><th>UAE vs PH</th></tr>`;
    const uaeMoney = (aed, tank) => P === 'AED' ? [fmt(aed) + ' AED', fmt(aed * r, tank ? 0 : 2) + ' PHP'] : [fmt(aed * r, tank ? 0 : 2) + ' PHP', fmt(aed) + ' AED'];
    const phMoney = (php, tank) => P === 'PHP' ? [fmt(php, tank ? 0 : 2) + ' PHP', fmt(php / r) + ' AED'] : [fmt(php / r) + ' AED', fmt(php, tank ? 0 : 2) + ' PHP'];
    const lock = (c, i, label) => edited[c + i] ? `<div class="lock"><span class="pill warn">Custom Price Locked</span><button class="btn ghost unlock" data-c="${c}" data-i="${i}" aria-label="Unlock ${label} price and sync">Unlock / Sync</button></div>` : '';
    let cards = '';
    uae.forEach(([name, price], i) => {
      const phName = ph[i][0], phPrice = ph[i][1], uaePhp = price * r, diff = (uaePhp - phPrice) / phPrice * 100, cls = diff <= 0 ? 'good' : 'bad';
      h += `<tr><td>${name}<br><small class="note">${phName}</small></td>
        <td class="mono price" data-c="uae" data-i="${i}">${fmt(price)}${edited['uae' + i] ? '*' : ''}</td><td class="mono">${fmt(uaePhp)}</td>
        <td class="mono price" data-c="ph" data-i="${i}">${fmt(phPrice)}${edited['ph' + i] ? '*' : ''}</td>
        <td class="mono">${fmt(price * L)} AED<br><small class="note">${fmt(price * L * r, 0)} PHP</small></td>
        <td class="mono">${fmt(phPrice * L, 0)} PHP<br><small class="note">${fmt(phPrice * L / r)} AED</small></td>
        <td><span class="pill ${cls}">${diff > 0 ? '+' : ''}${fmt(diff, 1)}%</span></td></tr>`;
      const [ul, ul2] = uaeMoney(price), [ut, ut2] = uaeMoney(price * L, true), [pl, pl2] = phMoney(phPrice), [pt, pt2] = phMoney(phPrice * L, true);
      cards += `<article class="mcard${i === state.grade ? ' sel' : ''}"><header><h3>${name} <span>vs ${phName}</span></h3><span class="pill ${cls}">${diff > 0 ? '+' : ''}${fmt(diff, 1)}%</span></header>
        <div class="cols"><div><h4>🇦🇪 UAE</h4><p class="lbl">Per litre</p><p class="num">${ul}</p><p class="sub-num">≈ ${ul2}</p><p class="lbl">${L} L tank</p><p class="num">${ut}</p><p class="sub-num">≈ ${ut2}</p>${lock('uae', i, name + ' UAE')}</div>
        <div><h4>🇵🇭 Philippines</h4><p class="lbl">Per litre</p><p class="num">${pl}</p><p class="sub-num">≈ ${pl2}</p><p class="lbl">${L} L tank</p><p class="num">${pt}</p><p class="sub-num">≈ ${pt2}</p>${lock('ph', i, phName + ' Philippines')}</div></div>
        <footer><button class="btn ghost price" data-c="uae" data-i="${i}">Edit AED/L</button><button class="btn ghost price" data-c="ph" data-i="${i}">Edit PHP/L</button></footer></article>`;
    });
    $('#matrix').innerHTML = h; $('#matrixCards').innerHTML = cards;
    const stale = state.prices.month !== new Date().toISOString().slice(0, 7), el = $('#priceStatus');
    el.textContent = `UAE prices: ${monthLabel(state.prices.month)} (${state.prices.src}).` + (stale ? ' A newer monthly announcement may be out: tap Sync UAE prices.' : '') + ' * = your edit.';
    el.style.color = stale ? 'var(--accent)' : '';
    $('#matrixNote').textContent = 'A negative % means UAE fuel is cheaper than the Philippines after conversion.';
  }
  document.addEventListener('click', e => {
    const u = e.target.closest('.unlock');
    if (u) {
      const { c, i } = u.dataset; delete state.prices.edited[c + i]; state.prices[c][i][1] = BASELINE[c][i][1];
      persistPrices(); refresh(); if (c === 'uae') syncUae(true); else toast('Price unlocked'); return;
    }
    const td = e.target.closest('.price'); if (!td) return;
    const { c, i } = td.dataset, cur = state.prices[c][i][1];
    const v = parseFloat(prompt(`New ${c === 'uae' ? 'AED' : 'PHP'}/L price for ${state.prices[c][i][0]}:`, cur));
    if (v > 0) { state.prices[c][i][1] = v; state.prices.edited[c + i] = true; persistPrices(); refresh(); }
  });
  $('#resetPrices').onclick = () => { state.prices = { ...clone(BASELINE), edited: {}, src: 'official baseline' }; persistPrices(); refresh(); toast('Baseline restored'); };
  $$('[data-prim]').forEach(b => b.onclick = () => { buzz(); state.primary = b.dataset.prim; store.set('primary', state.primary); $$('[data-prim]').forEach(x => x.classList.toggle('on', x === b)); renderMatrix(); });

  /* ---------- rewards, sparkline ---------- */
  function renderRewards() {
    const a = active(), net = a.price * (1 - state.cb / 100);
    $('#ptsL').textContent = state.liters; $('#pts').textContent = fmt(Math.round(state.liters * 1743 / 67), 0);
    $('#netAed').textContent = `${fmt(net)} AED/L`; $('#netPhp').textContent = `≈ ${fmt(net * state.rate)} PHP/L (${a.name}, ${state.cb}% rebate)`;
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
    const extra = items.reduce((s, k) => s + ADDONS[k][1], 0), tot = fuel + extra;
    $('#stopOut').innerHTML = `<div class="ln"><span>${a.name} · ${state.liters} L</span><b class="mono">${fmt(fuel)} AED</b></div>` +
      items.map(k => `<div class="ln"><span>${ADDONS[k][0]}</span><b class="mono">${fmt(ADDONS[k][1])} AED</b></div>`).join('') +
      `<div class="ln tot"><span>Station visit total</span><b class="mono">${fmt(tot)} AED ≈ ${fmt(tot * state.rate, 0)} PHP</b></div>`;
    $$('.ad').forEach(b => { const on = state.addons.includes(b.dataset.k); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  }
  $$('.ad').forEach(b => b.onclick = () => { buzz(); const k = b.dataset.k; state.addons = state.addons.includes(k) ? state.addons.filter(x => x !== k) : [...state.addons, k]; store.set('addons', state.addons); renderStop(); });
  function renderQuick() {
    const r = state.rate, { cur, amt } = state.qb, aed = cur === 'AED' ? amt : amt / r, u = state.prices.uae;
    $$('.qb').forEach(b => b.classList.toggle('on', b.dataset.cur === cur && +b.dataset.amt === amt));
    $('#qbOut').textContent = `${cur === 'AED' ? 'AED ' + fmt(amt, 0) : '₱' + fmt(amt, 0) + ' (≈ AED ' + fmt(aed) + ')'} buys ${fmt(aed / u[0][1])} L of Super 98 or ${fmt(aed / u[1][1])} L of Special 95.`;
    const a = active(), tank = a.price * state.liters;
    $('#remit').textContent = `Remittance value: one full ${state.liters} L tank of ${a.name} (${fmt(tank)} AED) equals about ₱${fmt(tank * r, 0)} at today’s rate.`;
  }
  $$('.qb').forEach(b => b.onclick = () => { buzz(); state.qb = { cur: b.dataset.cur, amt: +b.dataset.amt }; renderQuick(); });

  function renderBudget() {
    const b = num($('#budget')), a = active(), tank = a.price * state.liters, r = state.rate;
    if (!tank || !b) { $('#budgetOut').textContent = 'Enter a monthly allowance in AED to see how many full tanks it covers.'; return; }
    const tanks = Math.floor(b / tank), left = b - tanks * tank;
    $('#budgetOut').textContent = `${fmt(b, 0)} AED covers ${tanks} full ${state.liters} L tank${tanks === 1 ? '' : 's'} of ${a.name} at ${fmt(tank)} AED each (one fill-up uses ${fmt(tank / b * 100, 1)}% of the budget). Left over after full tanks: ${fmt(left)} AED ≈ ₱${fmt(left * r, 0)}.`;
  }

  /* ---------- commute ---------- */
  function renderCommute() {
    const route = $('#route').value, km = route === 'custom' ? num($('#customKm')) : +route;
    $('#customKmWrap').hidden = route !== 'custom';
    const a = active(), r = state.rate, lit = km / +$('#eff').value, fuel = lit * a.price, sal = +$('#gates').value * state.salik, tot = fuel + sal, n = state.split;
    const both = v => `${fmt(v)} AED ≈ ₱${fmt(v * r, 0)}`;
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
    const link = (q) => { const e = encodeURIComponent(q); return `<a class="chip" target="_blank" rel="noopener" href="https://maps.apple.com/?q=${e}">Apple Maps</a><a class="chip" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${e}">Google Maps</a><a class="chip" target="_blank" rel="noopener" href="https://waze.com/ul?q=${e}&navigate=yes">Waze</a>`; };
    const area = $('#area').value;
    $('#stationsOut').innerHTML = `<div class="stn"><b>Fuel stations near ${area}</b><div class="pillrow">${link('fuel station near ' + area + ' Dubai')}</div></div>` +
      [['ADNOC Service Station, Discovery Gardens', 'ADNOC Service Station Discovery Gardens Dubai'], ['ENOC, Jebel Ali Industrial', 'ENOC petrol station Jebel Ali Industrial Dubai'], ['Emarat, E11', 'Emarat petrol station E11 Sheikh Zayed Road Dubai']]
        .map(([t, q]) => `<div class="stn"><b>${t}</b><div class="pillrow">${link(q)}</div></div>`).join('');
  }
  $('#area').addEventListener('input', renderStations);

  /* ---------- live syncs ---------- */
  async function syncFx() {
    const r = await NewsFetcher.getRate();
    state.rate = r.rate; state.live = r.live; state.rateTime = r.t; store.set('rate', r.rate); refresh();
  }
  async function syncUae(manual) {
    const r = await NewsFetcher.syncUaePrices().catch(() => null);
    if (!r) { if (manual) toast('No new announcement found'); return; }
    r.prices.forEach((p, i) => { if (!state.prices.edited['uae' + i]) state.prices.uae[i][1] = p; });
    state.prices.month = r.month; state.prices.src = 'synced from news'; persistPrices(); refresh();
    if (manual) toast('UAE prices updated');
  }
  $('#syncPrices').onclick = () => syncUae(true);

  /* ---------- news ---------- */
  function renderNews() {
    const res = state.news, ul = $('#news'), c = state.cat; ul.innerHTML = '';
    const items = res.items.filter(n => c === 'all' || n.cat === c);
    items.forEach(n => {
      const li = document.createElement('li');
      const a = document.createElement('a'); a.href = n.link; a.target = '_blank'; a.rel = 'noopener'; a.textContent = n.title;
      const s = document.createElement('small'); s.textContent = n.source + (n.date ? ' · ' + new Date(n.date).toLocaleDateString() : '');
      const b = document.createElement('button'); b.className = 'btn ghost sh'; b.textContent = 'Share'; b.onclick = () => share(n.title, n.link);
      li.append(a, s, b); ul.append(li);
    });
    $('#newsStatus').textContent = res.fallback ? 'Live feeds unavailable right now. Showing official source links.'
      : !items.length ? 'No headlines in this category yet. See the official sources below.'
      : `Updated ${new Date(res.t).toLocaleTimeString()}${res.offline ? ' (saved copy, offline)' : ''}`;
    $('#fallbackCards').innerHTML = NewsFetcher.FALLBACK_CARDS.filter(f => c === 'all' || f.cat === c).map(f => `<a href="${f.url}" target="_blank" rel="noopener">${f.title}<small>${f.note}</small></a>`).join('');
    $$('.nf').forEach(b => b.classList.toggle('on', b.dataset.cat === c));
  }
  async function loadNews(force) { $('#newsStatus').textContent = 'Loading…'; state.news = await NewsFetcher.load(force); renderNews(); }
  $$('.nf').forEach(b => b.onclick = () => { state.cat = b.dataset.cat; renderNews(); });
  $('#refreshNews').onclick = () => loadNews(true);

  /* ---------- sharing ---------- */
  async function share(text, url = APP_URL) {
    try {
      if (navigator.share) return await navigator.share({ title: 'Dubai Fuel Monitor', text, url });
      await navigator.clipboard.writeText(`${text}\n${url}`); toast('Copied to clipboard');
    } catch (e) { if (e.name !== 'AbortError') toast('Could not share'); }
  }
  $('#shareBtn').onclick = () => { const a = active(); share(`Dubai fuel (${monthLabel(state.prices.month)}): ${a.name} ${fmt(a.price)} AED/L ≈ ${fmt(a.price * state.rate)} PHP/L. ${state.liters}L = ${fmt(a.price * state.liters)} AED ≈ ${fmt(a.price * state.liters * state.rate, 0)} PHP. 1 AED = ${fmt(state.rate, 3)} PHP.`); };
  $('#waBtn').onclick = () => {
    const a = active(), r = state.rate, L = state.liters;
    const t = `⛽ Dubai Fuel Update (${monthLabel(state.prices.month)}): ${a.name}: ${fmt(a.price)} AED/L (₱${fmt(a.price * r)}/L) | PH ${a.phName}: ₱${fmt(a.phPrice)}/L.\n${L}L fill-up: ${fmt(a.price * L)} AED (~₱${fmt(a.price * L * r, 0)}).\nCompare here: ${APP_URL}`;
    window.open('https://wa.me/?text=' + encodeURIComponent(t), '_blank', 'noopener');
  };

  /* ---------- story card (canvas) ---------- */
  let storyBlob = null;
  function drawStory() {
    const W = 1080, H = 1920, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    const F = '"Inter", system-ui, -apple-system, sans-serif', r = state.rate;
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#16213a'); g.addColorStop(1, '#05070c'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    const rr = (a, b, w, h, rad, fill) => { x.beginPath(); x.roundRect ? x.roundRect(a, b, w, h, rad) : x.rect(a, b, w, h); x.fillStyle = fill; x.fill(); };
    x.textAlign = 'center'; x.fillStyle = '#f5b83d'; x.font = `800 84px ${F}`; x.fillText('⛽ Dubai Fuel Monitor', W / 2, 190);
    x.fillStyle = '#f2f5fa'; x.font = `600 44px ${F}`; x.fillText(new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), W / 2, 270);
    rr(90, 330, 900, 150, 30, 'rgba(255,255,255,.08)'); x.fillStyle = '#f2f5fa'; x.font = `700 58px ${F}`; x.fillText(`1 AED = ${fmt(r, 3)} PHP`, W / 2, 425);
    x.fillStyle = '#9aa7bd'; x.font = `500 30px ${F}`; x.fillText(state.live ? 'Live exchange rate' : 'Cached exchange rate', W / 2, 468);
    x.fillStyle = '#9aa7bd'; x.font = `700 34px ${F}`; x.fillText('UAE vs Philippines · per litre', W / 2, 580);
    state.prices.uae.forEach(([name, p], i) => {
      const y = 620 + i * 280, php = state.prices.ph[i][1], d = (p * r - php) / php * 100;
      rr(70, y, 940, 250, 36, 'rgba(255,255,255,.07)');
      x.textAlign = 'left'; x.fillStyle = '#f5b83d'; x.font = `800 44px ${F}`; x.fillText(`${name} vs ${state.prices.ph[i][0]}`, 110, y + 70);
      x.fillStyle = '#f2f5fa'; x.font = `700 52px ${F}`; x.fillText(`🇦🇪 ${fmt(p)} AED`, 110, y + 150); x.font = `500 32px ${F}`; x.fillStyle = '#9aa7bd'; x.fillText(`≈ ₱${fmt(p * r)}`, 110, y + 200);
      x.fillStyle = '#f2f5fa'; x.font = `700 52px ${F}`; x.fillText(`🇵🇭 ₱${fmt(php)}`, 560, y + 150);
      x.textAlign = 'right'; x.fillStyle = d <= 0 ? '#3ddc97' : '#ff6b6b'; x.font = `800 44px ${F}`; x.fillText(`${d > 0 ? '+' : ''}${fmt(d, 1)}%`, 970, y + 70);
    });
    x.textAlign = 'center'; x.fillStyle = '#9aa7bd'; x.font = `500 28px ${F}`; x.fillText('% = UAE price vs Philippines after conversion', W / 2, 1780);
    x.fillStyle = '#f5b83d'; x.font = `700 34px ${F}`; x.fillText(APP_URL.replace('https://', ''), W / 2, 1850);
    return new Promise(res => c.toBlob(b => res(b), 'image/png'));
  }
  $('#storyBtn').onclick = async () => {
    storyBlob = await drawStory(); if (!storyBlob) return toast('Could not create the image');
    const old = $('#storyImg').src; if (old.startsWith('blob:')) URL.revokeObjectURL(old);
    $('#storyImg').src = URL.createObjectURL(storyBlob); $('#storyModal').hidden = false;
  };
  $('#storyClose').onclick = () => { $('#storyModal').hidden = true; };
  $('#storyDl').onclick = () => { const a = document.createElement('a'); a.href = $('#storyImg').src; a.download = 'dubai-fuel-story.png'; document.body.appendChild(a); a.click(); a.remove(); };
  $('#storyShare').onclick = async () => {
    const f = new File([storyBlob], 'dubai-fuel-story.png', { type: 'image/png' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [f] })) await navigator.share({ files: [f], title: 'Dubai Fuel Monitor', text: APP_URL });
      else toast('Image sharing is not supported here. Use Download.');
    } catch (e) { if (e.name !== 'AbortError') toast('Could not share'); }
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
  $('#iosGot').onclick = () => sheet(false);
  $('#iosHide').onclick = () => { store.set('iosHide', true); sheet(false); toast('You can reopen this from the ? button'); };
  $('#iosModal').addEventListener('click', e => { if (e.target.id === 'iosModal') sheet(false); });
  $('#storyModal').addEventListener('click', e => { if (e.target.id === 'storyModal') $('#storyModal').hidden = true; });
  addEventListener('keydown', e => { if (e.key === 'Escape') { sheet(false); $('#storyModal').hidden = true; } });
  if (isIOS && !standalone && !store.get('iosHide', false) && !store.get('iosShown', false)) { store.set('iosShown', true); setTimeout(() => sheet(true), 1500); }

  /* ---------- slider, presets ---------- */
  let animId = 0;
  function applyLiters(v) {
    state.liters = v; $('#vol').value = v; $('#volOut').textContent = v; store.set('liters', v);
    $$('.vp').forEach(b => b.classList.toggle('on', +b.dataset.v === v)); refresh();
  }
  function animateTo(target) {
    const id = ++animId, from = state.liters;
    if (from === target || state.mode === 'battery' || matchMedia('(prefers-reduced-motion: reduce)').matches) return applyLiters(target);
    const t0 = performance.now(), step = t => {
      if (id !== animId) return;
      const p = Math.min(1, (t - t0) / 300), e = 1 - Math.pow(1 - p, 3);
      applyLiters(Math.round(from + (target - from) * e)); if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  $('#vol').oninput = e => { animId++; applyLiters(+e.target.value); };
  $$('.vp').forEach(b => b.onclick = () => { buzz(); animateTo(+b.dataset.v); });
  $('#gradeSel').value = state.grade;
  $('#gradeSel').onchange = e => { state.grade = +e.target.value; store.set('grade', state.grade); refresh(); };
  $('#cbSel').value = state.cb; $('#cbSel').onchange = e => { state.cb = +e.target.value; store.set('cb', state.cb); renderRewards(); };

  /* ---------- inputs ---------- */
  const amt = $('#amt'); amt.removeAttribute('pattern'); amt.setAttribute('inputmode', 'decimal'); amt.step = 'any'; amt.min = 0;
  [amt, $('#budget'), $('#customKm')].forEach(el => el.addEventListener('input', () => { if (parseFloat(el.value) < 0) el.value = 0; }));
  amt.addEventListener('input', renderConverter);
  $('#budget').value = store.get('budget', 1000);
  $('#budget').addEventListener('input', () => { store.set('budget', num($('#budget'))); renderBudget(); renderTip(); });
  $('#dirBtn').onclick = () => { state.dir = state.dir === 'AED2PHP' ? 'PHP2AED' : 'AED2PHP'; store.set('dir', state.dir); renderConverter(); };
  $$('.seg[data-mode]').forEach(b => b.onclick = () => { buzz(); applyMode(b.dataset.mode); });

  /* ---------- pull to refresh ---------- */
  let y0 = null;
  addEventListener('touchstart', e => { y0 = scrollY === 0 ? e.touches[0].clientY : null; }, { passive: true });
  addEventListener('touchmove', e => { if (y0 !== null) $('#ptr').classList.toggle('on', e.touches[0].clientY - y0 > 90); }, { passive: true });
  addEventListener('touchend', () => { if ($('#ptr').classList.contains('on')) { $('#ptr').classList.remove('on'); buzz(); refreshAll(); } y0 = null; });
  const refreshAll = () => { syncFx(); syncUae(false); loadNews(true); };

  /* ---------- render everything ---------- */
  function refresh() { renderConverter(); renderMatrix(); renderRewards(); renderStop(); renderQuick(); renderBudget(); renderCommute(); }

  applyMode(state.mode);
  $$('[data-prim]').forEach(b => b.classList.toggle('on', b.dataset.prim === state.primary));
  applyLiters(state.liters); renderSpark(); renderTrackers(); renderTip(); renderStations(); loadNews(false);
  syncFx(); syncUae(false);
  setInterval(syncFx, 15 * 60 * 1000); setInterval(() => syncUae(false), 6 * 60 * 60 * 1000);
  setInterval(() => { renderFx(); renderTrackers(); }, 30000);
  addEventListener('online', refreshAll); addEventListener('offline', renderFx);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { syncFx(); renderTrackers(); } });
  if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
})();
