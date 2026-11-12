/* News aggregator, live FX and UAE price sync (vanilla ES6+) */
(() => {
  const gn = q => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-AE&gl=AE&ceid=AE:en`;
  const FEEDS = [
    { name: 'UAE fuel prices', cat: 'uae', url: gn('UAE fuel prices committee petrol diesel') },
    { name: 'Emirates news', cat: 'uae', url: gn('Emirates petrol diesel announcement') },
    { name: 'Dubai Salik & traffic', cat: 'traffic', url: gn('Dubai Salik RTA traffic toll') },
    { name: 'Philippines DOE', cat: 'ph', url: gn('Philippines DOE fuel price rollback hike pump') },
    { name: 'Reddit r/dubai', cat: 'uae', url: 'https://www.reddit.com/r/dubai/search.rss?q=fuel+OR+petrol&restrict_sr=1&sort=new' },
    { name: 'Global oil', cat: 'uae', url: gn('oil prices Brent crude') }
  ];
  const FALLBACK_CARDS = [
    { title: 'Gulf News', note: 'UAE energy & fuel', cat: 'uae', url: 'https://gulfnews.com/business/energy' },
    { title: 'Khaleej Times', note: 'UAE petrol & diesel', cat: 'uae', url: 'https://www.khaleejtimes.com/business/energy' },
    { title: 'RTA Dubai', note: 'Salik & traffic updates', cat: 'traffic', url: 'https://www.rta.ae/' },
    { title: 'DOE Philippines', note: 'Oil price monitor', cat: 'ph', url: 'https://doe.gov.ph/' }
  ];
  const FALLBACK_ITEMS = () => FALLBACK_CARDS.map(c => ({ source: c.title, title: `${c.title}: ${c.note}`, link: c.url, date: '', cat: c.cat }));
  const KEY = 'dubaifuel.news.v3';
  /* Endpoints tried in order; each returns {items} so one blocked service never breaks the feed. */
  const ENDPOINTS = [
    async u => { const d = await (await fetchT('https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(u))).json();
      if (d.status !== 'ok') throw 0; return d.items.map(i => ({ title: i.title, link: i.link, date: i.pubDate, desc: i.description })); },
    async u => parseXml(await (await fetchT('https://api.allorigins.win/raw?url=' + encodeURIComponent(u))).text()),
    async u => parseXml(await (await fetchT('https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u))).text()),
    async u => parseXml(await (await fetchT(u)).text()) // direct, works when the source sends CORS headers
  ];
  /* Every network call is aborted after 4s so nothing can hang. */
  const fetchT = async (url, ms = 4000, opts = {}) => {
    const c = new AbortController(), id = setTimeout(() => c.abort(), ms);
    try { return await fetch(url, { ...opts, signal: c.signal }); } finally { clearTimeout(id); }
  };
  const withDeadline = (p, ms, fb) => Promise.race([p.catch(() => fb), new Promise(r => setTimeout(() => r(fb), ms))]);
  const strip = h => (h || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&amp;/g, ' ').replace(/\s+/g, ' ').trim();

  function parseXml(text) {
    const doc = new DOMParser().parseFromString(text, 'text/xml');
    const items = [...doc.querySelectorAll('item, entry')].map(i => {
      const l = i.querySelector('link');
      return { title: (i.querySelector('title')?.textContent || '').trim(), link: l?.getAttribute('href') || l?.textContent || '#',
        date: i.querySelector('pubDate, updated, published')?.textContent || '', desc: i.querySelector('description, summary, content')?.textContent || '' };
    });
    if (!items.length) throw 0;
    return items;
  }

  async function fetchFeed(url) {
    for (const ep of ENDPOINTS) { try { const r = await ep(url); if (r.length) return r; } catch (_) {} }
    return [];
  }

  async function load(force = false) {
    let cached = null; try { cached = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) {}
    if (!force && cached && Date.now() - cached.t < 15 * 60 * 1000) return { items: cached.items, t: cached.t };
    const lists = await Promise.all(FEEDS.map(async f => (await withDeadline(fetchFeed(f.url), 6000, [])).slice(0, 8).map(i => ({ source: f.name, title: strip(i.title), link: i.link, date: i.date, cat: f.cat }))));
    const all = lists.flat().filter(x => x.title);
    if (all.length) {
      all.sort((a, b) => new Date(b.date) - new Date(a.date));
      const out = { items: all.slice(0, 30), t: Date.now() };
      try { localStorage.setItem(KEY, JSON.stringify(out)); } catch (_) {}
      return out;
    }
    if (cached && cached.items.length) return { items: cached.items, t: cached.t, offline: true };
    return { items: FALLBACK_ITEMS(), t: Date.now(), offline: true, fallback: true };   // structured fallback, never empty
  }

  /* Live AED->PHP from open.er-api.com first, then a second provider, then cache. */
  async function getRate() {
    const RK = 'dubaifuel.rate.v1';
    for (const u of ['https://open.er-api.com/v6/latest/AED', 'https://api.exchangerate-api.com/v4/latest/AED']) {
      try {
        const d = await (await fetchT(u, 4000, { cache: 'no-store' })).json();
        const rate = d.rates && d.rates.PHP;
        if (rate > 5 && rate < 40) { try { localStorage.setItem(RK, JSON.stringify({ rate, t: Date.now() })); } catch (_) {} return { rate, live: true, t: Date.now() }; }
      } catch (_) {}
    }
    try { const c = JSON.parse(localStorage.getItem(RK) || 'null'); if (c) return { rate: c.rate, live: false, t: c.t }; } catch (_) {}
    return { rate: 15.8, live: false, t: 0 };
  }

  /* Best-effort: read the monthly UAE Fuel Price Committee figures from current headlines. */
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  async function syncUaePrices(date = new Date()) {
    const mName = MONTHS[date.getMonth()], yr = date.getFullYear();
    const q = `UAE fuel prices ${mName} ${yr} Super 98 Special 95 E-Plus diesel`;
    const items = await fetchFeed(gn(q));
    const found = {}; const re = {
      s98: /super\D{0,4}98\D{0,40}?(\d\.\d{2})/i, s95: /special\D{0,4}95\D{0,40}?(\d\.\d{2})/i,
      e91: /e-?\s*plus\D{0,4}91\D{0,40}?(\d\.\d{2})/i, diesel: /diesel\D{0,40}?(\d\.\d{2})/i };
    items.forEach(i => {
      const txt = strip(i.title + ' ' + i.desc);
      if (!new RegExp(mName, 'i').test(txt) || !String(yr).includes(String(yr)) || !txt.includes(String(yr))) return;
      for (const k in re) { const m = txt.match(re[k]); if (m && !found[k]) found[k] = parseFloat(m[1]); }
    });
    const ok = Object.keys(re).every(k => found[k] > 1.5 && found[k] < 9);
    return ok ? { month: `${yr}-${String(date.getMonth() + 1).padStart(2, '0')}`, prices: [found.s98, found.s95, found.e91, found.diesel] } : null;
  }

  window.NewsFetcher = { load, getRate, syncUaePrices, FALLBACK_CARDS };
})();
