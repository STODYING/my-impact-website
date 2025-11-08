// Netlify Function: SSR for WordPress post pages
import fetch from "node-fetch";

const SITE = "https://impactceo.art";                 // 예: https://impactceo.art
const WP   = "https://impactceo0.wordpress.com";      // 당신의 WP 기본 URL

export async function handler(event) {
  try {
    // /post/<slug> 가 /functions/render-post/<slug> 로 들어옴
    const slug = (event.path || "").split("/").pop();
    if (!slug) return { statusCode: 404, body: "Not Found" };

    // slug가 숫자면 id로, 아니면 slug 검색
    let post;
    if (/^\d+$/.test(slug)) {
      const r = await fetch(`${WP}/wp-json/wp/v2/posts/${slug}?_embed`);
      if (!r.ok) throw new Error("post not found");
      post = await r.json();
    } else {
      const r = await fetch(`${WP}/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}&_embed`);
      const list = r.ok ? await r.json() : [];
      if (!Array.isArray(list) || list.length === 0) throw new Error("post not found");
      post = list[0];
    }

    // 데이터 추출
    const title = strip(post?.title?.rendered) || "제목 없음";
    const desc  = strip(post?.excerpt?.rendered)?.slice(0,160) || title;
    const body  = post?.content?.rendered || "";
    const img   = post?._embedded?.["wp:featuredmedia"]?.[0]?.source_url || `${SITE}/logo.png`;
    const url   = `${SITE}/post/${post.slug || post.id}`;

    // 완성 HTML (필수 메타 + 본문 삽입)
    const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} - IMPACT</title>
<meta name="description" content="${escapeHtml(desc)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="article">
<meta property="og:title" content="${escapeHtml(title)} - IMPACT">
<meta property="og:description" content="${escapeHtml(desc)}">
<meta property="og:image" content="${img}">
<meta property="og:url" content="${url}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)} - IMPACT">
<meta name="twitter:description" content="${escapeHtml(desc)}">
<meta name="twitter:image" content="${img}">
<script type="application/ld+json">${JSON.stringify({
  "@context":"https://schema.org",
  "@type":"Article",
  headline: title,
  description: desc,
  image: img,
  datePublished: post.date,
  dateModified: post.modified || post.date,
  author: { "@type":"Person", name: post?._embedded?.author?.[0]?.name || "익명" },
  mainEntityOfPage: { "@type":"WebPage", "@id": url },
  publisher: { "@type":"Organization", name: "IMPACT", logo:{ "@type":"ImageObject", url: `${SITE}/logo.png` } }
})}</script>
<link rel="icon" href="/logo.png">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/your-shared.css"><!-- 필요시: 기존 스타일 경로 -->
</head>
<body>
  <article class="post-article">
    <header>
      <h1>${post?.title?.rendered || ""}</h1>
      <p style="color:#666">${formatDate(post.date)}</p>
      ${img ? `<img src="${img}" alt="${escapeHtml(title)}" style="max-width:100%;border-radius:12px">` : ""}
    </header>
    <section class="post-content">${body}</section>
  </article>
  <!-- 선택: 밑에 SPA 스크립트를 로드해도 되고 안 해도 됩니다 -->
</body></html>`;

    return {
      statusCode: 200,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control":"public, max-age=600" },
      body: html
    };
  } catch (e) {
    return { statusCode: 404, body: "Not Found" };
  }
}

function strip(s=""){ return s.replace(/<\/?[^>]+>/g,"").trim(); }
function escapeHtml(s=""){ return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function formatDate(d){ try{const x=new Date(d);return `${x.getFullYear()}.${String(x.getMonth()+1).padStart(2,"0")}.${String(x.getDate()).padStart(2,"0")}.`; }catch{return "";} }

