export async function handler(event, context) {
  const fetch = (await import("node-fetch")).default;

  const WP_SITE = "impactceo0.wordpress.com";
  const ACCESS_TOKEN = process.env.WP_TOKEN; // ✅ Netlify 환경변수

  const path = event.queryStringParameters.path;
  if (!path) {
    return { statusCode: 400, body: "Missing path" };
  }

  const url = `https://public-api.wordpress.com/wp/v2/sites/${WP_SITE}/${path}`;

  try {
    const res = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${ACCESS_TOKEN}`
      }
    });

    const data = await res.text();

    return {
      statusCode: res.status,
      headers: { "Content-Type": "application/json" },
      body: data
    };
  } catch (err) {
    return { statusCode: 500, body: err.message };
  }
}
