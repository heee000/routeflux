import http from "node:http";

http.createServer((request, response) => {
  let body = "";
  request.setEncoding("utf8");
  request.on("data", (chunk) => { body += chunk; });
  request.on("end", () => {
    const payload = JSON.parse(body || "{}");
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({
      id: "mock-completion",
      object: "chat.completion",
      model: payload.model,
      choices: [{
        index: 0,
        message: { role: "assistant", content: "mock response" },
        finish_reason: "stop"
      }],
      usage: { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150 }
    }));
  });
}).listen(19090, "127.0.0.1");
