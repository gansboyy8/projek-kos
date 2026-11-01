import { createRequire } from "node:module";
import { Readable } from "node:stream";

const require = createRequire(import.meta.url);
const handleRequest = require("../../server.js");

export const config = { path: "/api/*" };

export default async function api(request) {
  const url = new URL(request.url);
  const body = Buffer.from(await request.arrayBuffer());
  const nodeRequest = Readable.from([body]);
  nodeRequest.method = request.method;
  nodeRequest.url = `${url.pathname}${url.search}`;
  nodeRequest.headers = Object.fromEntries(request.headers.entries());
  nodeRequest.headers.host ||= url.host;
  nodeRequest.headers["x-forwarded-host"] ||= url.host;
  nodeRequest.headers["x-forwarded-proto"] ||= url.protocol.slice(0, -1);
  nodeRequest.socket = { encrypted: url.protocol === "https:" };

  let status = 200;
  let headers = new Headers();
  let resolveResponse;
  const responsePromise = new Promise((resolve) => { resolveResponse = resolve; });
  const nodeResponse = {
    headersSent: false,
    setHeader(name, value) {
      headers.set(name, value);
    },
    writeHead(code, values = {}) {
      status = code;
      for (const [name, value] of Object.entries(values)) headers.set(name, value);
      this.headersSent = true;
      return this;
    },
    end(value) {
      resolveResponse(new Response(value ?? null, { status, headers }));
    }
  };

  await handleRequest(nodeRequest, nodeResponse);
  return responsePromise;
}
