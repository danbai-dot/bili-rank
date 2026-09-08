import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SITE_DATA = join(ROOT, 'site', 'data');

const CHARACTERS = [
  { slug: 'ailixiya', name: '爱莉希雅', keyword: '爱莉希雅' },
  { slug: 'xilian', name: '昔涟', keyword: '昔涟' },
  { slug: 'leimiaier', name: '蕾米艾尔', keyword: '蕾米艾尔' },
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const REFERER = 'https://www.bilibili.com/';
const MAX_PAGES = 8;
const TOP_N = 5;
const DAY_SECONDS = 86400;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

async function requestJson(url, cookieHeader) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Referer: REFERER,
      'Accept-Language': 'zh-CN,zh;q=0.9',
      Cookie: cookieHeader,
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

async function searchCharacter(char) {
  const { start, end } = shanghaiToday();
  const videos = [];
  const seen = new Set();
  let cookieJar = await getCookieJar();

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=${encodeURIComponent(char.keyword)}&order=pubdate&page=${page}`;
    let result = null;

    for (let attempt = 0; attempt < 4; attempt++) {
      const cookieHeader = Object.entries(cookieJar)
        .map(([k, v]) => `${k}=${v}`)
        .join('; ');
      const { json } = await requestJson(url, cookieHeader);
      if (json && json.code === 0) {
        result = json;
        break;
      }
      console.warn(`  [${char.name}] page ${page} attempt ${attempt + 1} failed (code=${json && json.code})`);
      cookieJar = await getCookieJar();
      await sleep(1500 * (attempt + 1));
    }

    if (!result) {
      throw new Error(`${char.name} search failed after retries`);
    }

    const items = (result.data && result.data.result) || [];
    if (!items.length) break;

    for (const it of items) {
      const pub = typeof it.pubdate === 'number' ? it.pubdate : parseInt(it.pubdate, 10);
      if (!Number.isFinite(pub) || pub < start || pub >= end) continue;
      if (!it.bvid || seen.has(it.bvid)) continue;
      seen.add(it.bvid);
      videos.push({
        title: cleanTitle(it.title),
        bvid: it.bvid,
        play: Number(it.play) || 0,
        pubdate: pub,
        pic: normalizePic(it.pic),
        duration: String(it.duration || ''),
        author: String(it.author || ''),
      });
    }

    await sleep(700);
  }

  videos.sort((a, b) => b.play - a.play || b.pubdate - a.pubdate);
  const top = videos.slice(0, TOP_N);
  return { videos: top, count: videos.length, totalPlay: top.reduce((s, v) => s + v.play, 0) };
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
      const r = await searchCharacter(c);
      successCount++;
      characters[c.slug] = {
        name: c.name,
        keyword: c.keyword,
        totalPlay: r.totalPlay,
        count: r.count,
        videos: r.videos,
      };
      console.log(`[ok] ${c.name}: today=${r.count} top5Play=${r.totalPlay}`);
    } catch (e) {
      console.error(`[error] ${c.name}: ${e.message}`);
      if (latestPrev && latestPrev.characters && latestPrev.characters[c.slug]) {
        characters[c.slug] = { ...latestPrev.characters[c.slug], error: true };
      } else {
        characters[c.slug] = { name: c.name, keyword: c.keyword, totalPlay: 0, count: 0, videos: [], error: true };
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
          Object.entries(characters).map(([k, v]) => [k, { totalPlay: v.totalPlay, count: v.count, error: !!v.error }])
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
