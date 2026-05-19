#!/usr/bin/env node

const https = require('https');
const fs = require('fs');
const path = require('path');

const WP_API = 'https://impactceo0.wordpress.com/wp-json/wp/v2';
const SITE_URL = 'https://impactceo.art';
const OUTPUT_FILE = path.join(__dirname, 'sitemap.xml');

function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toISOString().split('T')[0];
}

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function fetchAllPosts() {
  let allPosts = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    try {
      const url = `${WP_API}/posts?per_page=${perPage}&page=${page}&_fields=id,slug,modified`;
      console.log(`Fetching page ${page}...`);
      
      const posts = await fetch(url);
      
      if (!Array.isArray(posts) || posts.length === 0) break;
      
      allPosts = allPosts.concat(posts);
      console.log(`  Found ${posts.length} posts (total: ${allPosts.length})`);
      
      page++;
      
      if (page > 50) break;
    } catch (error) {
      console.error(`Error fetching page ${page}:`, error.message);
      break;
    }
  }
  
  return allPosts;
}

async function generateSitemap() {
  console.log('Starting sitemap generation...');
  
  try {
    const posts = await fetchAllPosts();
    
    if (posts.length === 0) {
      console.error('No posts found');
      process.exit(1);
    }
    
    console.log(`Found ${posts.length} posts total`);
    
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml"
        xmlns:mobile="http://www.google.com/schemas/sitemap-mobile/1.0"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">

  <!-- 홈페이지 -->
  <url>
    <loc>${SITE_URL}/</loc>
    <lastmod>${formatDate(new Date())}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>

  <!-- About 페이지 -->
  <url>
    <loc>${SITE_URL}/?page=about</loc>
    <lastmod>${formatDate(new Date())}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>

  <!-- Editors 페이지 -->
  <url>
    <loc>${SITE_URL}/?page=editors</loc>
    <lastmod>${formatDate(new Date())}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>

  <!-- 검색 페이지 -->
  <url>
    <loc>${SITE_URL}/?page=search</loc>
    <lastmod>${formatDate(new Date())}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
  </url>

  <!-- 카테고리 페이지들 -->
  <url>
    <loc>${SITE_URL}/?category=tech</loc>
    <lastmod>${formatDate(new Date())}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>

  <url>
    <loc>${SITE_URL}/?category=eat</loc>
    <lastmod>${formatDate(new Date())}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>

  <url>
    <loc>${SITE_URL}/?category=style</loc>
    <lastmod>${formatDate(new Date())}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>

  <url>
    <loc>${SITE_URL}/?category=culture</loc>
    <lastmod>${formatDate(new Date())}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>

  <url>
    <loc>${SITE_URL}/?category=life</loc>
    <lastmod>${formatDate(new Date())}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>

  <url>
    <loc>${SITE_URL}/?category=editors-pick</loc>
    <lastmod>${formatDate(new Date())}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>

  <!-- 개별 게시물들 -->
`;
    
    posts.forEach(post => {
      xml += `  <url>
    <loc>${SITE_URL}/?post=${post.id}</loc>
    <lastmod>${formatDate(post.modified)}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>

`;
    });
    
    xml += `</urlset>`;
    
    fs.writeFileSync(OUTPUT_FILE, xml, 'utf8');
    console.log(`✅ Sitemap generated successfully: ${OUTPUT_FILE}`);
    console.log(`   Total URLs: ${posts.length + 11}`);
    console.log(`   File size: ${(xml.length / 1024).toFixed(2)} KB`);
    
  } catch (error) {
    console.error('❌ Error generating sitemap:', error);
    process.exit(1);
  }
}

generateSitemap();
