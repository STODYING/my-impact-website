// netlify/functions/wpProxy.js
// 최소 동작: 클라이언트에서 `?path=`에 WP API path를 넣어 호출하면,
// 서버가 환경변수 WP_TOKEN을 사용해 WordPress API에 요청하고 결과를 그대로 반환합니다.

import fetch from "node-fetch"; // Netlify Node 버전에서 사용 가능

export async function handler(event, context) {
  const WP_SITE = "impactceo0.wordpress.com";
  const ACCESS_TOKEN = process.env.WP_TOKEN; // Netlify 환경변수

  const path = event.queryStringParameters && event.queryStringParameters.path;
  if (!path) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing path" }) };
  }

  // 안전: path가 이미 ?로 쿼리 포함된 상태로 들어올 수 있음 (우리는 인코딩해서 보냄).
  const url = `https://public-api.wordpress.com/wp/v2/sites/${WP_SITE}/${path}`;

  try {
    const res = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${ACCESS_TOKEN}`,
        "Accept": "application/json"
      }
    });

    const text = await res.text();

    return {
      statusCode: res.status,
      headers: {
        "Content-Type": res.headers.get("content-type") || "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: text
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}
