const CHAR_META = {
  ailixiya: { name: '爱莉希雅', page: 'ailixiya.html' },
  xilian: { name: '昔涟', page: 'xilian.html' },
  leimiaier: { name: '蕾米埃尔', page: 'leimiaier.html' },
};
const SLUGS = ['ailixiya', 'xilian', 'leimiaier'];

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function fmt(n) {
  n = Number(n) || 0;
  if (n >= 1e8) return (n / 1e8).toFixed(2).replace(/\.00$/, '') + ' 亿';
  if (n >= 1e4) return (n / 1e4).toFixed(1).replace(/\.0$/, '') + ' 万';
  return String(n);
}

function fmtUpdated(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('zh-CN', {
    hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function videoUrl(bvid) {
  return 'https://www.bilibili.com/video/' + encodeURIComponent(bvid);
}

async function loadJSON(path) {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

function errorHTML(title, e) {
  const msg = e && e.message ? esc(e.message) : '';
  return '<div class="error"><h2>' + esc(title) + '</h2><p>' + msg + '</p><p><a href="index.html">返回总览</a></p></div>';
}

function cardHTML(v, i) {
  return (
    '<a class="card" href="' + videoUrl(v.bvid) + '" target="_blank" rel="noopener">' +
      '<div class="thumb">' +
        '<img loading="lazy" src="' + esc(v.pic) + '" alt="" onerror="this.classList.add(\'img-failed\')">' +
        '<span class="dur">' + esc(v.duration) + '</span>' +
        '<span class="rank">#' + (i + 1) + '</span>' +
      '</div>' +
      '<div class="card-body">' +
        '<h3 class="title">' + esc(v.title) + '</h3>' +
        '<div class="meta"><span>UP：' + esc(v.author) + '</span><span>播放 ' + fmt(v.play) + '</span></div>' +
      '</div>' +
    '</a>'
  );
}

async function renderIndex() {
  const app = document.getElementById('app');
  try {
    const [latest, history] = await Promise.all([
      loadJSON('data/latest.json'),
      loadJSON('data/history.json'),
    ]);

    const chars = SLUGS.map((slug) => {
      const c = (latest.characters && latest.characters[slug]) || {};
      return Object.assign({ slug }, CHAR_META[slug], c);
    });

    const status = latest.status === 'partial'
      ? ' <span class="badge warn">部分更新失败，个别数据沿用昨日</span>'
      : '';

    const cards = chars.map((c, i) => {
      const badge = c.error ? '<span class="badge warn">更新失败</span>' : '';
      return (
        '<a class="char-card" href="' + c.page + '">' +
          '<div class="char-card-head"><span class="char-rank">' + (i + 1) + '</span>' +
          '<span class="char-name">' + esc(c.name) + '</span></div>' +
          '<div class="char-total">' + fmt(c.totalPlay) + '</div>' +
          '<div class="char-sub">今日 Top5 播放量之和' + (c.count ? ' · 今日 ' + c.count + ' 条' : '') + '</div>' +
          badge +
        '</a>'
      );
    }).join('');

    const rows = (Array.isArray(history) ? history : []).slice(0, 14).map((h) => (
      '<tr><td>' + esc(h.date) + '</td>' +
      '<td>' + fmt(h.ailixiya) + '</td>' +
      '<td>' + fmt(h.xilian) + '</td>' +
      '<td>' + fmt(h.leimiaier) + '</td>' +
      '<td class="total-cell">' + fmt(h.totalPopularity) + '</td></tr>'
    )).join('');

    app.innerHTML =
      '<section class="hero">' +
        '<div class="hero-date">最后更新：' + esc(fmtUpdated(latest.updatedAt)) + status + '</div>' +
        '<h1>三人总人气</h1>' +
        '<div class="big-number">' + fmt(latest.totalPopularity) + '</div>' +
        '<div class="hero-note">爱莉希雅 · 昔涟 · 蕾米埃尔 · 每日统计一次</div>' +
      '</section>' +
      '<section class="char-grid">' + cards + '</section>' +
      '<section class="history"><h2>历史记录</h2><div class="table-wrap"><table>' +
        '<thead><tr><th>日期</th><th>爱莉希雅</th><th>昔涟</th><th>蕾米埃尔</th><th>总人气</th></tr></thead>' +
        '<tbody>' + (rows || '<tr><td colspan="5" class="empty">暂无历史数据</td></tr>') + '</tbody>' +
      '</table></div></section>';
  } catch (e) {
    app.innerHTML = errorHTML('数据加载失败', e);
  }
}

async function renderCharacter(slug) {
  const app = document.getElementById('app');
  const meta = CHAR_META[slug];
  if (!meta) {
    app.innerHTML = errorHTML('未知角色');
    return;
  }
  document.title = meta.name + ' · B站每日人气榜';
  try {
    const latest = await loadJSON('data/latest.json');
    const c = (latest.characters && latest.characters[slug]) || {};
    const videos = Array.isArray(c.videos) ? c.videos : [];

    const note = c.error
      ? ' <span class="badge warn">更新失败，可能沿用昨日数据</span>'
      : (c.count > 0 && c.count < 5 ? ' <span class="badge">今日仅 ' + c.count + ' 条</span>' : '');

    const cards = videos.map((v, i) => cardHTML(v, i)).join('');

    app.innerHTML =
      '<section class="char-hero">' +
        '<h1>' + esc(meta.name) + '</h1>' +
        '<div class="char-page-total">当日 Top5 播放量之和：<strong>' + fmt(c.totalPlay || 0) + '</strong></div>' +
        '<div class="hero-date">最后更新：' + esc(fmtUpdated(latest.updatedAt)) + note + '</div>' +
      '</section>' +
      '<section class="video-grid">' +
        (cards || '<div class="empty">今日暂无相关视频</div>') +
      '</section>';
  } catch (e) {
    app.innerHTML = errorHTML('数据加载失败', e);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const slug = document.body.getAttribute('data-slug');
  if (slug) renderCharacter(slug);
  else renderIndex();
});

