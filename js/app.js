/* Dubai Fuel Monitor – UI controller (vanilla ES6+) */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const APP_URL = 'https://esp046-cyber.github.io/dubaijebelalinews/';
  const store = {
    get: (k, d) => { try { const v = localStorage.getItem('dubaifuel.' + k); return v === null ? d : JSON.parse(v); } catch (_) { return d; } },
    set: (k, v) => { try { localStorage.setItem('dubaifuel.' + k, JSON.stringify(v)); } catch (_) {} }
  };

  /* Reference prices (editable estimates). Super 98 = ADNOC receipt. */
  const DEFAULTS = {
    uae: [['Super 98', 4.16], ['Special 95', 3.93], ['E-Plus 91', 3.85], ['Diesel', 4.14]],
    ph:  [['Blaze 100 / Turbo', 78.0], ['Unleaded 95', 64.0], ['Regular 91', 60.0], ['Diesel', 58.0]]
  };
  const state = {
    rate: store.get('rate', 15.8), rateSrc: 'offline estimate',
    dir: store.get('dir', 'AED2PHP'), liters: store.get('liters', 67),
    mode: store.get('mode', 'standard'), prices: store.get('prices', DEFAULTS)
  };

  const fmt = (n, d = 2) => Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
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
    $('#rateSrc').textContent = `Rate source: ${state.rateSrc}.`;
    $('#receiptPhp').textContent = `278.72 AED ≈ ${fmt(278.72 * state.rate)} PHP at the current rate.`;
  }

  function renderMatrix() {
    const L = state.liters, r = state.rate, { uae, ph } = state.prices;
    let h = `<tr><th>Grade (UAE / PH)</th><th>UAE AED/L</th><th>UAE PHP/L</th><th>PH PHP/L</th><th>UAE ${L}L</th><th>PH ${L}L</th><th>UAE vs PH</th></tr>`;
    uae.forEach(([name, price], i) => {
      const phName = ph[i][0], phPrice = ph[i][1], uaePhp = price * r;
      const diff = (uaePhp - phPrice) / phPrice * 100;
      h += `<tr><td>${name}<br><small class="note">${phName}</small></td>
        <td class="mono price" data-c="uae" data-i="${i}">${fmt(price)}</td>
        <td class="mono">${fmt(uaePhp)}</td>
        <td class="mono price" data-c="ph" data-i="${i}">${fmt(phPrice)}</td>
        <td class="mono">${fmt(price * L)} AED<br><small class="note">${fmt(price * L * r, 0)} PHP</small></td>
        <td class="mono">${fmt(phPrice * L, 0)} PHP<br><small class="note">${fmt(phPrice * L / r)} AED</small></td>
        <td><span class="pill ${diff <= 0 ? 'good' : 'bad'}">${diff > 0 ? '+' : ''}${fmt(diff, 1)}%</span></td></tr>`;
    });
    $('#matrix').innerHTML = h;
    $('#matrixNote').textContent = 'A negative % means UAE fuel is cheaper than the Philippines after conversion.';
  }
  $('#matrix').addEventListener('click', e => {
    const td = e.target.closest('.price'); if (!td) return;
    const { c, i } = td.dataset, cur = state.prices[c][i][1];
    const v = parseFloat(prompt(`New ${c === 'uae' ? 'AED' : 'PHP'}/L price for ${state.prices[c][i][0]}:`, cur));
    if (v > 0) { state.prices[c][i][1] = v; store.set('prices', state.prices); renderMatrix(); }
  });

  function renderNews(res) {
    const ul = $('#news'); ul.innerHTML = '';
    if (!res.items.length) { $('#newsStatus').textContent = 'No saved news yet. Connect once to store headlines for offline use.'; return; }
    res.items.forEach(n => {
      const li = document.createElement('li');
      const a = document.createElement('a'); a.href = n.link; a.target = '_blank'; a.rel = 'noopener'; a.textContent = n.title;
      const s = document.createElement('small'); s.textContent = n.source + (n.date ? ' · ' + new Date(n.date).toLocaleDateString() : '');
      const b = document.createElement('button'); b.className = 'btn ghost sh'; b.textContent = 'Share';
      b.onclick = () => share(n.title, n.link);
      li.append(a, s, b); ul.append(li);
    });
    $('#newsStatus').textContent = res.t ? `Updated ${new Date(res.t).toLocaleTimeString()}${res.offline ? ' (saved copy, offline)' : ''}` : '';
  }
  async function loadNews(force) { $('#newsStatus').textContent = 'Loading…'; renderNews(await NewsFetcher.load(force)); }

  async function share(text, url = APP_URL) {
    const data = { title: 'Dubai Fuel Monitor', text, url };
    try {
      if (navigator.share) return await navigator.share(data);
      await navigator.clipboard.writeText(`${text}\n${url}`); toast('Copied to clipboard');
    } catch (e) { if (e.name !== 'AbortError') toast('Could not share'); }
  }
  function priceSummary() {
    const L = state.liters, p = state.prices.uae[0][1];
    return `Dubai fuel: Super 98 ${fmt(p)} AED/L (≈ ${fmt(p * state.rate)} PHP/L). ${L}L fill-up = ${fmt(p * L)} AED ≈ ${fmt(p * L * state.rate, 0)} PHP. 1 AED = ${fmt(state.rate, 3)} PHP.`;
  }

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

  async function refreshAll() {
    const r = await NewsFetcher.getRate();
    state.rate = r.rate; state.rateSrc = r.src; store.set('rate', r.rate);
    renderConverter(); renderMatrix(); loadNews(true);
  }

  document.querySelectorAll('.seg').forEach(b => b.onclick = () => applyMode(b.dataset.mode));
  $('#dirBtn').onclick = () => { state.dir = state.dir === 'AED2PHP' ? 'PHP2AED' : 'AED2PHP'; store.set('dir', state.dir); renderConverter(); };
  $('#amt').oninput = renderConverter;
  $('#vol').oninput = e => { state.liters = +e.target.value; $('#volOut').textContent = state.liters; store.set('liters', state.liters); renderMatrix(); };
  document.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { $('#vol').value = b.dataset.v; $('#vol').dispatchEvent(new Event('input')); });
  $('#shareBtn').onclick = () => share(priceSummary());
  $('#refreshNews').onclick = () => loadNews(true);

  $('#vol').value = state.liters; $('#volOut').textContent = state.liters;
  applyMode(state.mode); renderConverter(); renderMatrix(); loadNews(false);
  NewsFetcher.getRate().then(r => { state.rate = r.rate; state.rateSrc = r.src; store.set('rate', r.rate); renderConverter(); renderMatrix(); });

  if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
})();
