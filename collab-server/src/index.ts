import { Hono } from "hono";
import { YDurableObjects, yRoute } from "y-durableobjects";
import { cors } from "hono/cors";

type Bindings = {
  Y_DURABLE_OBJECTS: DurableObjectNamespace<YDurableObjects<Env>>;
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

// Yjs 协作路由 - WebSocket 连接端点
// 客户端通过 ws://host/editor/{docId} 连接
const route = app.route(
  "/editor",
  yRoute<Env>((env) => env.Y_DURABLE_OBJECTS),
);

export default route;
export type AppType = typeof route;
export { YDurableObjects };
