// server.js

Bun.serve({
  port: 5050,

  fetch(req) {
    return new Response("Hello from Bun!", {
      headers: {
        "Content-Type": "text/plain",
      },
    });
  },

  error(error) {
    console.error(error);

    return new Response("Internal Server Error", {
      status: 500,
    });
  },
});

console.log("Server is running on http://localhost:5050");
