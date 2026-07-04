// Netlify Edge Function: 게시물별 동적 렌더링(Dynamic Rendering)
// - 사람(일반 브라우저)  -> 기존 SPA(index.html)를 그대로 통과시킴 (context.next())
// - 봇/크롤러(카카오톡/페이스북/트위터/구글/네이버 등) -> 게시물별 SEO/OG 메타 + 본문이
//   포함된 완성 HTML을 즉시 서버에서 렌더링해 응답 => 각 게시물마다 프리렌더링/링크 미리보기 정상화
//
// 연결: 이 파일 하단의 `export const config = { path: "/post/*" }` 로 자동 매칭됩니다.

const SITE = "https://impactceo.art"; // 사이트 기본 URL
const WP = "https://impactceo0.wordpress.com"; // WordPress 기본 URL

// 소셜/검색 크롤러 User-Agent 패턴 (한국 주요 크롤러 포함)
const BOT_RE = new RegExp(
  [
    "bot", "crawl", "spider", "slurp", "mediapartners",
    "facebookexternalhit", "facebot",
    "twitterbot",
    "kakaotalk", "kakaostory", "kakao",
    "slackbot", "telegrambot", "whatsapp", "line/", "discordbot",
    "applebot", "googlebot", "google-inspectiontool", "bingbot",
    "yeti", "naver", "daum", "yandex", "baidu", "duckduckbot",
    "linkedinbot", "pinterest", "redditbot", "embedly", "quora",
    "outbrain", "nuzzel", "vkshare", "w3c_validator", "skypeuripreview",
  ].join("|"),
  "i"
);

export default async (request, context) => {
  const ua = request.headers.get("user-agent") || "";

  // 사람은 SPA를 그대로 사용
  if (!BOT_RE.test(ua)) {
    return context.next();
  }

  try {
    const url = new URL(request.url);
    const slug = decodeURIComponent(
      url.pathname.replace(/^\/post\//, "").replace(/\/+$/, "")
    );
    if (!slug) return context.next();

    let post;
    if (/^\d+$/.test(slug)) {
      const r = await fetch(`${WP}/wp-json/wp/v2/posts/${slug}?_embed`);
      if (!r.ok) return context.next();
      post = await r.json();
    } else {
      const r = await fetch(
        `${WP}/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}&_embed`
      );
      const list = r.ok ? await r.json() : [];
      if (!Array.isArray(list) || list.length === 0) return context.next();
      post = list[0];
    }

    const html = buildHtml(post);
    return new Response(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        // CDN 캐시 10분, 브라우저 5분
        "cache-control": "public, max-age=300, s-maxage=600",
        "x-render-mode": "prerender-bot",
      },
    });
  } catch (e) {
    // 실패하면 그냥 SPA로 폴백
    return context.next();
  }
};

function buildHtml(post) {
  const title = strip(post?.title?.rendered) || "제목 없음";
  const desc = (strip(post?.excerpt?.rendered) || title).slice(0, 160);
  const body = post?.content?.rendered || "";
  const img =
    post?._embedded?.["wp:featuredmedia"]?.[0]?.source_url ||
    `${SITE}/logo.png`;
  const url = `${SITE}/post/${post.slug || post.id}`;
  const authorName = post?._embedded?.author?.[0]?.name || "익명";

  const ld = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description: desc,
    image: img,
    datePublished: post.date,
    dateModified: post.modified || post.date,
    author: { "@type": "Person", name: authorName },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    publisher: {
      "@type": "Organization",
      name: "IMPACT",
      logo: { "@type": "ImageObject", url: `${SITE}/logo.png` },
    },
  };

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} - IMPACT</title>
<meta name="description" content="${escapeHtml(desc)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<link rel="canonical" href="${escapeHtml(url)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="IMPACT Magazine">
<meta property="og:locale" content="ko_KR">
<meta property="og:title" content="${escapeHtml(title)} - IMPACT">
<meta property="og:description" content="${escapeHtml(desc)}">
<meta property="og:image" content="${escapeHtml(img)}">
<meta property="og:url" content="${escapeHtml(url)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)} - IMPACT">
<meta name="twitter:description" content="${escapeHtml(desc)}">
<meta name="twitter:image" content="${escapeHtml(img)}">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<link rel="icon" href="/logo.png">
</head>
<body>
  <article class="post-article">
    <header>
      <h1>${post?.title?.rendered || escapeHtml(title)}</h1>
      <p style="color:#666">${formatDate(post.date)} · ${escapeHtml(authorName)}</p>
      ${img ? `<img src="${escapeHtml(img)}" alt="${escapeHtml(title)}" style="max-width:100%;border-radius:12px">` : ""}
    </header>
    <section class="post-content">${body}</section>
    <p><a href="${escapeHtml(url)}">${escapeHtml(title)} 전체 보기</a></p>
  </article>
</body></html>`;
}

function strip(s = "") {
  return String(s).replace(/<\/?[^>]+>/g, "").replace(/\s+/g, " ").trim();
}
function escapeHtml(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function formatDate(d) {
  try {
    const x = new Date(d);
    return `${x.getFullYear()}.${String(x.getMonth() + 1).padStart(2, "0")}.${String(
      x.getDate()
    ).padStart(2, "0")}.`;
  } catch {
    return "";
  }
}

export const config = { path: "/post/*" };
