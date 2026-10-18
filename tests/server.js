import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const basePath = "/agent-seal/";
const types = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8"
};

createServer(async (request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  if (pathname === "/" || pathname === "/agent-seal") {
    response.writeHead(302, { Location: basePath }).end();
    return;
  }
  const file = pathname.slice(basePath.length) || "index.html";
  if (
    !["GET", "HEAD"].includes(request.method) ||
    !pathname.startsWith(basePath) ||
    !(file === "index.html" || /^assets\/[a-z0-9-]+\.(css|js)$/.test(file))
  ) {
    response.writeHead(404).end("Not found");
    return;
  }
  try {
    const content = await readFile(new URL(file, root));
    response.writeHead(200, {
      "Content-Type": types[file.split(".").pop()],
      "Cache-Control": "no-store"
    });
    response.end(request.method === "HEAD" ? undefined : content);
  } catch (error) {
    if (error.code === "ENOENT") {
      response.writeHead(404).end("Not found");
    } else {
      console.error(error);
      response.writeHead(500).end("Could not read the file");
    }
  }
}).listen(4173, "127.0.0.1", () => {
  console.log("Open http://127.0.0.1:4173/agent-seal/");
});
