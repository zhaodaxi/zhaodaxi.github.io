# 前沿动态

给开发者看的前沿科技日报。站点每天从一批公开来源抓取论文、研究博客、开源趋势和中文科技新闻，去重后按日期存档，并发布到 [GitHub Pages](https://zhaodaxi.github.io)。

界面是中文。不需要 API 密钥，也不加载第三方脚本或字体。

## 页面

- `/` 最近一次日报，按分类排列
- `/archive/` 按日期浏览
- `/archive/YYYY-MM-DD/` 某一天的快照
- `/search/` 在全部归档里检索。匹配在浏览器里完成

右上角可以切换浅色 / 深色。没有手动选择时，跟随系统。

## 它怎么工作

1. GitHub Actions 在每天 **00:00 UTC（北京时间 08:00）** 运行 `Daily digest`。也可以在 Actions 页面手动触发。GitHub 的定时任务偶尔会晚几分钟到几十分钟。
2. `scripts/fetch.mjs` 读取根目录的 `sources.config.json`，逐个抓取。某一个来源超时或返回错误时，只记一条日志，其他来源继续。
3. 同一天里的重复链接、以及标题几乎相同的条目会被合并。结果写入 `data/digests/YYYY-MM-DD.json`，并提交回仓库。日期按北京时间计算。同一天再次运行会覆盖这一天的文件。
4. Astro 把这些 JSON 建成静态站，部署到 GitHub Pages。

如果所有来源都失败，这次不会覆盖已有文件，工作流会标成失败。

## 添加或停用来源

只改 `sources.config.json` 的 `sources` 数组。

RSS 或 Atom：

```json
{
  "id": "example",
  "name": "示例博客",
  "category": "research",
  "type": "rss",
  "url": "https://example.com/feed.xml",
  "limit": 5,
  "maxAgeDays": 14
}
```

`category` 必须是 `categories` 里已有的 `id`。想暂时停用又不删掉配置时，加上 `"enabled": false`。

| type | 做什么 |
| --- | --- |
| `rss` | 读取 `url` 指向的 RSS 或 Atom |
| `arxiv` | 读取 `url` 指向的 arXiv RSS（如 `https://rss.arxiv.org/rss/cs.AI`），只保留 `Announce Type: new` 的新提交 |
| `hackernews` | Hacker News 热门故事，走官方 Firebase 接口 |
| `github-trending` | 解析 GitHub Trending 日榜。页面结构变了或解析结果太少时，改用 `fallbackUrl` 的公开 RSS 镜像 |

`limit` 是这个来源最多保留多少条。`maxAgeDays` 会丢掉更早的条目；Hacker News 和 Trending 不设这个字段，因为它们本身就是“当下”的榜单。

改完推到默认分支，或者到 Actions 里手动跑一次 **Daily digest**。

## 本地运行

需要 Node.js 20 或更新。

```bash
npm ci
npm test
npm run fetch
npm run build
npm run preview
```

`npm run fetch` 会访问外网，并把当天的 JSON 写到 `data/digests/`。构建不抓取，只读取已经落盘的数据。

## 部署前的一次性设置

合并之后需要在 GitHub 上做两件事，否则页面不会更新：

1. **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。
2. **Settings → Actions → General → Workflow permissions** 选择 **Read and write permissions**。每日任务要把日报 JSON 提交回仓库，只有读取权限时这一步会失败。

如果默认分支有保护规则、不允许机器人直接推送，需要放行 `github-actions[bot]`，否则站点也许能部署，但日期归档不会写回仓库。

合并后可以先手动运行一次 Daily digest，不用等到第二天早上。

## 可选：中文摘要

默认展示来源里的原文摘要，英文条目不会被翻译。如果以后想加一句简体中文摘要，在 **Settings → Secrets and variables → Actions** 里添加：

| Secret | 是否必须 | 说明 |
| --- | --- | --- |
| `SUMMARY_API_KEY` | 启用时必须 | 兼容 OpenAI Chat Completions 的密钥 |
| `SUMMARY_API_BASE` | 否 | 默认 `https://api.openai.com/v1`。其他兼容接口改这里 |
| `SUMMARY_MODEL` | 否 | 默认 `gpt-4o-mini` |

不配置密钥时，抓取和部署照常成功。摘要接口失败也只会跳过这一批，不会让整次任务失败。每次最多处理约 40 条非中文条目。已经主要是中文的条目会跳过。

本地试用：

```bash
SUMMARY_API_KEY=sk-... npm run fetch
```

生成的句子写在每条的 `summaryZh` 字段里，页面上会标「中文摘要」。

## 目录

- `sources.config.json`：来源，只改这一份
- `scripts/`：抓取、去重、可选摘要
- `data/digests/`：按天存放的 JSON
- `src/`：Astro 站点
- `.github/workflows/daily.yml`：定时抓取、提交、构建、部署
- `.github/workflows/ci.yml`：拉取请求时测试并构建

## 现在的来源

论文：arXiv `cs.AI`、`cs.LG`、`cs.CL`。

研究：OpenAI、Google AI、Google DeepMind、Hugging Face、Simon Willison、Latent Space、Interconnects、Import AI、MIT Technology Review（AI）、The Verge AI、NVIDIA Developer、BAIR。

开源：GitHub Trending 日榜、GitHub Blog。

社区：Hacker News 热门故事。

中文：量子位、雷峰网、Solidot、InfoQ 中文、开源中国。

机器之心目前没有稳定的公开 RSS（`/rss` 会落到网页），所以没有列入。找到稳定地址后，按上面的 RSS 例子加一条即可。

## 限制

- 定时任务由 GitHub 调度，不保证准点 08:00。
- 没有密钥就没有机器翻译，英文摘要保持原文。
- GitHub Trending 没有官方 API。页面解析失败时使用第三方 RSS 镜像；镜像也失败则跳过该来源。
- 去重看的是规范化后的链接，以及去掉标点后高度相同的标题。同一件事如果标题差很多，会同时留下。
- 跨天不去重。一条热门内容可能连续几天出现，每天的文件是当天的快照。
- 个别网站会拦截数据中心的 IP。那一个来源会失败，其他来源不受影响。
- 检索索引在构建时生成，只能搜到已经提交的归档。同一链接只保留最近一次。
