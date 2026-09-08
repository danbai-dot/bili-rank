import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SITE_DATA = join(ROOT, 'site', 'data');

const CHARACTERS = [
  { slug: 'ailixiya', name: '爱莉希雅', keyword: '爱莉希雅' },
  { slug: 'xilian', name: '昔涟', keyword: '昔涟' },
  { slug: 'leimiaier', name: '蕾米埃尔', keyword: '蕾米埃尔' },
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const REFERER = 'https://www.bilibili.com/';
const MAX_PAGES = 10;
const TOP_N = 5;
const HISTORY_TOP_N = 10;
const DAY_SECONDS = 86400;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (x) => (typeof x === 'number' ? x : parseInt(x, 10));

function shanghaiToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type).value;
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  const start = Math.floor(Date.parse(`${date}T00:00:00+08:00`) / 1000);
  return { date, start, end: start + DAY_SECONDS };
}

function decodeHtml(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function cleanTitle(t) {
  return decodeHtml(String(t || '').replace(/<[^>]*>/g, '')).trim();
}

function normalizePic(pic) {
  if (!pic) return '';
  const p = String(pic);
  if (p.startsWith('//')) return 'https:' + p;
  if (p.startsWith('http://') || p.startsWith('https://')) return p;
  return 'https:' + p;
}

function mapVideo(it) {
  return {
    title: cleanTitle(it.title),
    bvid: it.bvid,
    play: Number(it.play) || 0,
    pubdate: num(it.pubdate),
    pic: normalizePic(it.pic),
    duration: String(it.duration || ''),
    author: String(it.author || ''),
  };
}

function isChronological(items) {
  if (!items || items.length < 3) return true;
  let inversions = 0;
  for (let i = 1; i < items.length; i++) {
    if (num(items[i].pubdate) > num(items[i - 1].pubdate)) inversions++;
  }
  const pairs = items.length - 1;
  return inversions <= Math.ceil(pairs * 0.15);
}

async function getCookieJar() {
  const res = await fetch('https://www.bilibili.com/', {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'zh-CN,zh;q=0.9',
    },
    redirect: 'follow',
  });
  const cookies = [];
  if (typeof res.headers.getSetCookie === 'function') {
    cookies.push(...res.headers.getSetCookie());
  } else {
    const sc = res.headers.get('set-cookie');
    if (sc) cookies.push(sc);
  }
  const jar = {};
  for (const c of cookies) {
    const m = c.match(/^\s*([^=]+)=([^;]*)/);
    if (m) jar[m[1]] = m[2];
  }
  return jar;
}

function cookieHeader(jar) {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

async function requestJson(url, cookieHeaderStr) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Referer: REFERER,
      'Accept-Language': 'zh-CN,zh;q=0.9',
      Cookie: cookieHeaderStr,
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

async function fetchChronologicalPage(keyword, page, cookieJar) {
  const url = `https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=${encodeURIComponent(keyword)}&order=pubdate&page=${page}`;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { json } = await requestJson(url, cookieHeader(cookieJar));
    if (json && json.code === 0) {
      const items = (json.data && json.data.result) || [];
      if (isChronological(items)) return items;
      console.warn(`  [${keyword}] page ${page} attempt ${attempt + 1}: not time-ordered, retrying`);
    } else {
      console.warn(`  [${keyword}] page ${page} attempt ${attempt + 1}: code=${json && json.code}`);
    }
    cookieJar.buvid3 = (await getCookieJar()).buvid3;
    await sleep(1200 * (attempt + 1));
  }
  return null;
}

async function searchToday(char) {
  const { start, end } = shanghaiToday();
  const videos = [];
  const seen = new Set();
  const cookieJar = await getCookieJar();

  for (let page = 1; page <= MAX_PAGES; page++) {
    const items = await fetchChronologicalPage(char.keyword, page, cookieJar);
    if (!items) throw new Error(`${char.name} search page ${page} failed after retries`);
    if (!items.length) break;

    let sawOlder = false;
    for (const it of items) {
      const pub = num(it.pubdate);
      if (!Number.isFinite(pub) || pub < start) {
        sawOlder = true;
        continue;
      }
      if (pub >= end) continue;
      if (!it.bvid || seen.has(it.bvid)) continue;
      seen.add(it.bvid);
      videos.push(mapVideo(it));
    }

    if (sawOlder) break;
    await sleep(500);
  }

  videos.sort((a, b) => b.play - a.play || b.pubdate - a.pubdate);
  const top = videos.slice(0, TOP_N);
  return { videos: top, count: videos.length, totalPlay: top.reduce((s, v) => s + v.play, 0) };
}

async function searchAllTimeTop(char, excludeBvids) {
  const out = [];
  const seen = new Set(excludeBvids);
  const cookieJar = await getCookieJar();

  for (let page = 1; page <= 3 && out.length < HISTORY_TOP_N; page++) {
    const url = `https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=${encodeURIComponent(char.keyword)}&order=click&page=${page}`;
    let items = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      const { json } = await requestJson(url, cookieHeader(cookieJar));
      if (json && json.code === 0) {
        items = (json.data && json.data.result) || [];
        break;
      }
      cookieJar.buvid3 = (await getCookieJar()).buvid3;
      await sleep(1000 * (attempt + 1));
    }
    if (!items || !items.length) break;

    for (const it of items) {
      if (out.length >= HISTORY_TOP_N) break;
      if (!it.bvid || seen.has(it.bvid)) continue;
      seen.add(it.bvid);
      out.push(mapVideo(it));
    }
    await sleep(500);
  }

  return out.slice(0, HISTORY_TOP_N);
}

function loadJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

async function main() {
  mkdirSync(SITE_DATA, { recursive: true });
  const { date } = shanghaiToday();
  const latestPrev = loadJson(join(SITE_DATA, 'latest.json'));
  const historyRaw = loadJson(join(SITE_DATA, 'history.json'));
  const history = Array.isArray(historyRaw) ? historyRaw : [];

  const characters = {};
  let successCount = 0;

  for (const c of CHARACTERS) {
    try {
      const today = await searchToday(c);
      let top = [];
      try {
        top = await searchAllTimeTop(c, new Set(today.videos.map((v) => v.bvid)));
      } catch (e) {
        console.warn(`[warn] ${c.name} all-time top fetch failed: ${e.message}`);
        if (latestPrev && latestPrev.characters && latestPrev.characters[c.slug] && latestPrev.characters[c.slug].history) {
          top = latestPrev.characters[c.slug].history;
        }
      }
      successCount++;
      characters[c.slug] = {
        name: c.name,
        keyword: c.keyword,
        totalPlay: today.totalPlay,
        count: today.count,
        videos: today.videos,
        history: top,
      };
      console.log(`[ok] ${c.name}: today=${today.count} top5Play=${today.totalPlay} history=${top.length}`);
    } catch (e) {
      console.error(`[error] ${c.name}: ${e.message}`);
      if (latestPrev && latestPrev.characters && latestPrev.characters[c.slug]) {
        characters[c.slug] = { ...latestPrev.characters[c.slug], error: true };
      } else {
        characters[c.slug] = { name: c.name, keyword: c.keyword, totalPlay: 0, count: 0, videos: [], history: [], error: true };
      }
    }
  }

  if (successCount === 0) {
    console.error('All character fetches failed; keeping previous data (no overwrite).');
    process.exit(1);
  }

  const totalPopularity = Object.values(characters).reduce((s, c) => s + (c.totalPlay || 0), 0);
  const latest = {
    date,
    updatedAt: new Date().toISOString(),
    totalPopularity,
    characters,
    status: successCount === CHARACTERS.length ? 'ok' : 'partial',
  };

  writeFileSync(join(SITE_DATA, 'latest.json'), JSON.stringify(latest, null, 2) + '\n');

  const entry = {
    date,
    totalPopularity,
    ailixiya: characters.ailixiya ? characters.ailixiya.totalPlay : 0,
    xilian: characters.xilian ? characters.xilian.totalPlay : 0,
    leimiaier: characters.leimiaier ? characters.leimiaier.totalPlay : 0,
  };
  const nextHistory = history.filter((e) => e && e.date !== date);
  nextHistory.unshift(entry);
  nextHistory.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  writeFileSync(join(SITE_DATA, 'history.json'), JSON.stringify(nextHistory.slice(0, 90), null, 2) + '\n');

  console.log(
    JSON.stringify(
      {
        date,
        status: latest.status,
        successCount,
        totalPopularity,
        perCharacter: Object.fromEntries(
          Object.entries(characters).map(([k, v]) => [k, { totalPlay: v.totalPlay, count: v.count, historyCount: v.history.length, error: !!v.error }])
        ),
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
