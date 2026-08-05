#!/usr/bin/env node
/**
 * column/ 配下の記事HTMLファイルを読み取り、
 *  1) column/index.html の記事一覧(article-grid)
 *  2) ルート直下の sitemap.xml
 * を自動生成するスクリプト。
 *
 * 各記事ファイルの <head> 内から以下を抽出して使用します:
 *  - og:title           → カードの見出し
 *  - meta description   → カードの説明文
 *  - .cat-tag            → カードのカテゴリタグ
 *  - dateModified (JSON-LD) → 更新日・sitemapのlastmod
 *
 * 実行方法: node .github/scripts/build-column.js
 * (GitHub Actionsから自動実行される想定。ローカルでの手動実行も可)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const COLUMN_DIR = path.join(ROOT, 'column');
const INDEX_PATH = path.join(COLUMN_DIR, 'index.html');
const SITEMAP_PATH = path.join(ROOT, 'sitemap.xml');
const SITE_URL = 'https://textyle-ni.net';

// ルート直下の固定ページ(このスクリプトでは自動生成しない部分)
// ページが増えた場合はここに追記してください。
const STATIC_PAGES = [
  { loc: `${SITE_URL}/`, lastmod: '2026-08-04', changefreq: 'weekly', priority: '1.0' },
  { loc: `${SITE_URL}/works.html`, lastmod: '2026-08-04', changefreq: 'monthly', priority: '0.9' },
  { loc: `${SITE_URL}/en.html`, lastmod: '2026-08-04', changefreq: 'monthly', priority: '0.7' },
];

function extract(html, regex) {
  const m = html.match(regex);
  return m ? m[1] : null;
}

function main() {
  if (!fs.existsSync(COLUMN_DIR)) {
    console.error(`❌ ${COLUMN_DIR} が見つかりません。`);
    process.exit(1);
  }

  const files = fs.readdirSync(COLUMN_DIR)
    .filter(f => f.endsWith('.html') && f !== 'index.html');

  if (files.length === 0) {
    console.warn('⚠️ column/ 配下に記事ファイルが見つかりませんでした。');
  }

  const articles = files.map(filename => {
    const html = fs.readFileSync(path.join(COLUMN_DIR, filename), 'utf8');
    const title = extract(html, /<meta property="og:title" content="([^"]+)">/);
    const description = extract(html, /<meta name="description" content="([^"]+)">/);
    const category = extract(html, /<span class="cat-tag">([^<]+)<\/span>/);
    const dateModified = extract(html, /"dateModified":\s*"([0-9-]+)"/);

    if (!title || !description || !category || !dateModified) {
      console.warn(`⚠️  ${filename}: og:title / description / cat-tag / dateModified のいずれかが見つかりませんでした。テンプレートを確認してください。`);
    }

    return {
      filename,
      title: title || filename,
      description: description || '',
      category: category || '',
      dateModified: dateModified || '1970-01-01',
    };
  }).sort((a, b) => (a.dateModified < b.dateModified ? 1 : -1));

  updateColumnIndex(articles);
  updateSitemap(articles);

  console.log(`✅ column/index.html と sitemap.xml を更新しました(記事数: ${articles.length})`);
}

function updateColumnIndex(articles) {
  const cardsHtml = articles.map(a => {
    const [y, m] = a.dateModified.split('-');
    return `      <a class="article-card" href="${a.filename}">
        <span class="cat-tag">${a.category}</span>
        <h3>${a.title}</h3>
        <p>${a.description}</p>
        <span class="article-date">${y}.${m} 更新</span>
      </a>`;
  }).join('\n');

  let indexHtml = fs.readFileSync(INDEX_PATH, 'utf8');
  const startMarker = '<!-- ARTICLES:START -->';
  const endMarker = '<!-- ARTICLES:END -->';
  const startIdx = indexHtml.indexOf(startMarker);
  const endIdx = indexHtml.indexOf(endMarker);

  if (startIdx === -1 || endIdx === -1) {
    console.error('❌ column/index.html に <!-- ARTICLES:START --> / <!-- ARTICLES:END --> マーカーが見つかりません。');
    process.exit(1);
  }

  indexHtml =
    indexHtml.slice(0, startIdx + startMarker.length) +
    '\n' + cardsHtml + '\n      ' +
    indexHtml.slice(endIdx);

  fs.writeFileSync(INDEX_PATH, indexHtml);
}

function updateSitemap(articles) {
  const today = new Date().toISOString().slice(0, 10);

  const columnIndexUrl = {
    loc: `${SITE_URL}/column/index.html`,
    lastmod: today,
    changefreq: 'weekly',
    priority: '0.8',
  };

  const articleUrls = articles.map(a => ({
    loc: `${SITE_URL}/column/${a.filename}`,
    lastmod: a.dateModified,
    changefreq: 'monthly',
    priority: '0.6',
  }));

  const allUrls = [...STATIC_PAGES, columnIndexUrl, ...articleUrls];

  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>
`;

  fs.writeFileSync(SITEMAP_PATH, sitemapXml);
}

main();
