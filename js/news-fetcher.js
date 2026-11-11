/* News aggregator, live FX and UAE price sync (vanilla ES6+) */
(() => {
  const gn = q => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-AE&gl=AE&ceid=AE:en`;
  const FEEDS = [
    { name: 'UAE fuel prices', url: gn('UAE fuel prices committee petrol diesel') },
    { name: 'Emirates news', url: gn('Emirates petrol diesel announcement') },
    { name: 'Reddit r/dubai', url: 'https://www.reddit.com/r/dubai/search.rss?q=fuel+OR+petrol&restrict_sr=1&sort=new' },
    { name: 'Global oil', url: gn('oil prices Brent crude') }
  ];
  const FALLBACK_CARDS = [
    { title: 'Gulf News', note: 'UAE energy & fuel', url: 'https://gulfnews.com/business/energy' },
    { title: 'Khaleej Times', note: 'UAE petrol & diesel', url: 'https://www.khaleejtimes.com/business/energy' },
    { title: 'DOE Philippines', note: 'Oil price monitor', url: 'https://doe.gov.ph/' }
  ];
  const KEY = 'dubaifuel.news.v2';
  /* Endpoints tried in order; each returns {items} so one blocked service never breaks the feed. */
  const ENDPOINTS = [
    async u => { const d = await (await t(fetch('https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(u)))).json();
      if (d.status !== 'ok') throw 0; return d.items.map(i => ({ title: i.title, link: i.link, date: i.pubDate, desc: i.description })); },
    async u => parseXml(await (await t(fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent(u)))).text()),
    async u => parseXml(await (await t(fetch('https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u)))).text()),
    async u => parseXml(await (await t(fetch(u))).text()) // direct, works when the source sends CORS headers
  ];
  const t = (p, ms = 8000) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('timeout')), ms))]);
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
    const lists = await Promise.all(FEEDS.map(async f => (await fetchFeed(f.url)).slice(0, 8).map(i => ({ source: f.name, title: strip(i.title), link: i.link, date: i.date }))));
    const all = lists.flat().filter(x => x.title);
    if (all.length) {
      all.sort((a, b) => new Date(b.date) - new Date(a.date));
      const out = { items: all.slice(0, 30), t: Date.now() };
      try { localStorage.setItem(KEY, JSON.stringify(out)); } catch (_) {}
      return out;
    }
    return cached ? { items: cached.items, t: cached.t, offline: true } : { items: [], t: 0, offline: true };
  }

  /* Live AED->PHP from open.er-api.com first, then a second provider, then cache. */
  async function getRate() {
    const RK = 'dubaifuel.rate.v1';
    for (const u of ['https://open.er-api.com/v6/latest/AED', 'https://api.exchangerate-api.com/v4/latest/AED']) {
      try {
        const d = await (await t(fetch(u, { cache: 'no-store' }), 6000)).json();
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
