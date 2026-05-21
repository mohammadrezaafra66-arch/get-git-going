Deno.serve(() =>
  new Response(JSON.stringify({ ok: true, status: "empty" }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  })
);