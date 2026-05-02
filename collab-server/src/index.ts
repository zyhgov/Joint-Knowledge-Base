import { Hono } from "hono";
import { YDurableObjects, yRoute } from "y-durableobjects";
import { cors } from "hono/cors";

type Bindings = {
  Y_DURABLE_OBJECTS: DurableObjectNamespace<YDurableObjects<Env>>;
  VOLC_API_KEY: string;
  VOLC_MODEL: string;
};

type Env = {
  Bindings: Bindings;
};

const app = new Hono<Env>();

// CORS 配置 - 允许前端跨域访问
app.use("*", cors({
  origin: ["http://localhost:5173", "http://localhost:4173", "http://localhost:3000", "http://localhost:3001", "http://localhost:3002", "https://jkb.zyhorg.cn"],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));

// 健康检查
app.get("/", (c) => {
  return c.json({ status: "ok", service: "collab-docs-server", version: "1.0.0" });
});

// AI 对话 - 流式代理到火山引擎 API
app.post("/api/chat", async (c) => {
  const apiKey = c.env.VOLC_API_KEY;
  const defaultModel = c.env.VOLC_MODEL || "doubao-seed-1-8-251228";

  if (!apiKey) {
    return c.json({ error: "API 密钥未配置" }, 500);
  }

  const body = await c.req.json<{
    messages: { role: string; content: string }[];
    model?: string;
  }>();

  const model = body.model || defaultModel;

  const response = await fetch("https://ark.cn-beijing.volces.com/api/v3/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: body.messages,
      stream: true,
      max_tokens: 4096,
      temperature: 0.8,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return c.json({ error: `API 请求失败: ${response.status}`, detail: errorText }, response.status as 500);
  }

  // 透传 SSE 流
  return new Response(response.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});

// Yjs 协作路由 - WebSocket 连接端点
// 客户端通过 ws://host/editor/{docId} 连接
const route = app.route(
  "/editor",
  yRoute<Env>((env) => env.Y_DURABLE_OBJECTS),
);

export default route;
export type AppType = typeof route;
export { YDurableObjects };
