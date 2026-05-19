// Netlify Function: Dynamic Sitemap Generator
const WP_API = "https://impactceo0.wordpress.com/wp-json/wp/v2";
const SITE_URL = "https://impactceo.art";

export async function handler(event) {
  try {
    // 모든 게시물 가져오기
    let allPosts = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      const response = await fetch(`${WP_API}/posts?per_page=${perPage}&page=${page}&_fields=id,slug,modified`);
      
      if (!response.ok) {
        if (response.status === 400) break;
        throw new Error(`API error: ${response.status}`);
      }
      
      const posts = await response.json();
      if (posts.length === 0) break;
      
      allPosts = allPosts.concat(posts);
      page++;
      
      if (page > 50) break;
    }

    // XML 생성
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

    // 각 게시물 추가
    allPosts.forEach(post => {
      xml += `  <url>
    <loc>${SITE_URL}/?post=${post.id}</loc>
    <lastmod>${formatDate(post.modified)}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>

`;
    });

    xml += `</urlset>`;

    return {
      statusCode: 200,
      headers: {
        "content-type": "application/xml; charset=utf-8",
        "cache-control": "public, max-age=3600" // 1시간 캐시
      },
      body: xml
    };
  } catch (error) {
    console.error('Sitemap generation error:', error);
    return {
      statusCode: 500,
      body: `<?xml version="1.0" encoding="UTF-8"?>
<error>
  <message>Sitemap generation failed: ${error.message}</message>
</error>`
    };
  }
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toISOString().split('T')[0];
}
