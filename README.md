# B站角色每日人气榜

一个会自动更新的小网站：每天从 B 站抓取 **爱莉希雅、昔涟、蕾米埃尔** 三个角色“当天发布”的视频，按播放量排出每人「当天前五 + 历史前十」共 15 个视频，并统计三人总人气。

- `index.html` 总览：三人总人气 + 历史记录
- `ailixiya.html` / `xilian.html` / `leimiaier.html`：每个角色的「当天前五」+「历史前十」视频

## 网站文件

```
scripts/fetch.mjs        抓数据脚本（Node.js，无第三方依赖）
site/                    网站页面（纯 HTML/CSS/JS）
  index.html             总览页
  ailixiya.html          爱莉希雅页
  xilian.html            昔涟页
  leimiaier.html         蕾米埃尔页
  assets/style.css       样式
  assets/app.js          前端渲染逻辑
  data/latest.json       当日最新数据
  data/history.json      历史记录（保留 90 天）
.github/workflows/update.yml  每天自动更新并发布到 GitHub Pages
```

## 怎么让它上线（免费、可分享链接）

1. 注册一个 GitHub 账号（免费）。
2. 在 GitHub 新建一个仓库（repository），例如名字叫 `bili-rank`，设为 Public（公开）。
3. 把这个文件夹里的所有内容上传到该仓库（或用 Git 推送，我可以帮你操作）。
4. 打开仓库 → Settings → Pages，在 “Build and deployment / Source” 里选择 **GitHub Actions**。
5. 打开仓库 → Actions，找到 “Update daily rank”，点 “Run workflow” 手动跑一次。
6. 跑完后，网站会出现在：`https://你的用户名.github.io/bili-rank/`（仓库名不同则路径不同），任何人打开这个链接都能看。

之后不需要再管它：GitHub 每天会自动抓一次并更新页面。

## 本地手动刷新数据（可选）

需要电脑装有 Node.js，在项目根目录执行：

```bash
node scripts/fetch.mjs
```

它会抓取当天数据，并更新 `site/data/latest.json` 与 `site/data/history.json`。若云端定时任务被 B 站限流，也可以改用“本地运行 + 推送”的方式更新，网站托管方式不变。

## 数据说明

- “当天”按中国时区（Asia/Shanghai）计算，只统计当天投稿的视频。
- “当天前五”按播放量从高到低；播放量相同则按发布时间新到旧。
- “历史前十” = 该角色全部时间播放量前十（已排除当天前五，避免重复），按播放量从高到低。
- “总人气” = 三个角色各自 Top5 播放量之和，每天统计一次。


