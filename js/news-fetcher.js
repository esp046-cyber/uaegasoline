/* News aggregator + price sync helpers (vanilla ES6+) */
(() => {
  const FEEDS = [
    { name: 'UAE fuel prices', url: 'https://news.google.com/rss/search?q=UAE+fuel+prices+committee&hl=en-AE&gl=AE&ceid=AE:en' },
    { name: 'Emirates news', url: 'https://news.google.com/rss/search?q=Emirates+petrol+diesel+announcement&hl=en-AE&gl=AE&ceid=AE:en' },
    { name: 'Reddit r/dubai', url: 'https://www.reddit.com/r/dubai/search.rss?q=fuel+OR+petrol&restrict_sr=1&sort=new' },
    { name: 'Global oil', url: 'https://news.google.com/rss/search?q=oil+prices+Brent&hl=en&gl=US&ceid=US:en' }
  ];
  const KEY = 'dubaifuel.news.v1';
  const J = u => 'https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(u);
  const PROXY = u => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u);
  const withTimeout = (p, ms = 8000) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('timeout')), ms))]);

  function parseXml(text, source) {
    const doc = new DOMParser().parseFromString(text, 'text/xml');
    return [...doc.querySelectorAll('item, entry')].slice(0, 8).map(i => {
      const link = i.querySelector('link');
      return {
        source,
        title: (i.querySelector('title')?.textContent || '').trim(),
        link: link?.getAttribute('href') || link?.textContent || '#',
        date: i.querySelector('pubDate, updated, published')?.textContent || ''
      };
    });
  }

  async function loadFeed(f) {
    try {
      const d = await (await withTimeout(fetch(J(f.url)))).json();
      if (d.status === 'ok' && d.items?.length)
        return d.items.slice(0, 8).map(i => ({ source: f.name, title: i.title, link: i.link, date: i.pubDate }));
    } catch (_) {}
    try {
      const r = await withTimeout(fetch(PROXY(f.url)));
      return parseXml(await r.text(), f.name);
    } catch (_) { return []; }
  }

  async function load(force = false) {
    const cached = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!force && cached && Date.now() - cached.t < 15 * 60 * 1000) return { items: cached.items, t: cached.t };
    const all = (await Promise.all(FEEDS.map(loadFeed))).flat().filter(x => x.title);
    if (all.length) {
      all.sort((a, b) => new Date(b.date) - new Date(a.date));
      const out = { items: all.slice(0, 30), t: Date.now() };
      try { localStorage.setItem(KEY, JSON.stringify(out)); } catch (_) {}
      return out;
    }
    return cached ? { items: cached.items, t: cached.t, offline: true } : { items: [], t: 0, offline: true };
  }

  async function getRate() {
    const RK = 'dubaifuel.rate.v1';
    for (const u of ['https://open.er-api.com/v6/latest/AED', 'https://api.exchangerate-api.com/v4/latest/AED']) {
      try {
        const d = await (await withTimeout(fetch(u), 6000)).json();
        const rate = d.rates && d.rates.PHP;
        if (rate > 5 && rate < 40) {
          try { localStorage.setItem(RK, JSON.stringify({ rate, t: Date.now() })); } catch (_) {}
          return { rate, src: 'live', t: Date.now() };
        }
      } catch (_) {}
    }
    const c = JSON.parse(localStorage.getItem(RK) || 'null');
    if (c) return { rate: c.rate, src: 'cached', t: c.t };
    return { rate: 15.8, src: 'offline estimate', t: 0 };
  }

  window.NewsFetcher = { load, getRate };
})();
