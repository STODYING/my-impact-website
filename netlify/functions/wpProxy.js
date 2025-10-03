export async function handler(event, context) {
  // WordPress 사이트와 Netlify 환경변수에서 토큰 불러오기
  const WP_SITE = "impactceo0.wordpress.com";
  const ACCESS_TOKEN = process.env.WP_TOKEN; // 🔑 Netlify Environment Variable

  // 쿼리 파라미터 확인
  const path = event.queryStringParameters.path;
  if (!path) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing path" }),
    };
  }

  // WordPress API 요청 URL 구성
  const url = `https://public-api.wordpress.com/wp/v2/sites/${WP_SITE}/${path}`;

  try {
    // Node.js 18+ 환경에서는 fetch가 내장됨
    const res = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${ACCESS_TOKEN}`,
      },
    });

    const data = await res.text();

    return {
      statusCode: res.status,
      headers: { "Content-Type": "application/json" },
      body: data,
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}
