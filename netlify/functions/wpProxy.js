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

    // ✅ WordPress API의 중요한 헤더들을 클라이언트로 전달
    const responseHeaders = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*", // CORS 허용
      "Access-Control-Expose-Headers": "X-WP-Total, X-WP-TotalPages", // 헤더 노출 허용
    };

    // WordPress API 응답 헤더에서 중요한 정보 추출 및 전달
    const wpTotal = res.headers.get("X-WP-Total");
    const wpTotalPages = res.headers.get("X-WP-TotalPages");
    
    if (wpTotal) {
      responseHeaders["X-WP-Total"] = wpTotal;
    }
    if (wpTotalPages) {
      responseHeaders["X-WP-TotalPages"] = wpTotalPages;
    }

    return {
      statusCode: res.status,
      headers: responseHeaders,
      body: data,
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ error: err.message }),
    };
  }
}
