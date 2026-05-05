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

// 链接预览 - 获取网页 OG 元数据
app.get("/api/link-preview", async (c) => {
  const url = c.req.query("url");
  if (!url) {
    return c.json({ error: "缺少 url 参数" }, 400);
  }

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; JKB-LinkPreview/1.0)",
        "Accept": "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return c.json({ error: `获取页面失败: ${response.status}` }, 502);
    }

    const html = await response.text();

    // 提取 OG 标签
    const extractMeta = (property: string): string | null => {
      // 匹配 <meta property="og:..." content="..." />
      const regex = new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']*)["']`, "i");
      const match = html.match(regex);
      if (match) return match[1];
      // 也匹配 content 在前的格式
      const regex2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${property}["']`, "i");
      const match2 = html.match(regex2);
      return match2 ? match2[1] : null;
    };

    // 提取标题（优先 og:title，再取 <title>）
    let title = extractMeta("og:title");
    if (!title) {
      const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
      title = titleMatch ? titleMatch[1].trim() : null;
    }

    // 提取描述
    let description = extractMeta("og:description");
    if (!description) {
      description = extractMeta("description");
    }

    // 提取图片
    const image = extractMeta("og:image");

    // 提取站点名称
    const siteName = extractMeta("og:site_name");

    // 提取 favicon
    let favicon: string | null = null;
    const faviconMatch = html.match(/<link[^>]+rel=["'](?:icon|shortcut icon)["'][^>]+href=["']([^"']*)["']/i);
    if (faviconMatch) {
      favicon = faviconMatch[1];
      // 处理相对路径
      if (favicon.startsWith("//")) {
        favicon = "https:" + favicon;
      } else if (favicon.startsWith("/")) {
        try {
          const urlObj = new URL(url);
          favicon = urlObj.origin + favicon;
        } catch {}
      }
    }
    if (!favicon) {
      try {
        const urlObj = new URL(url);
        favicon = urlObj.origin + "/favicon.ico";
      } catch {}
    }

    return c.json({
      title: title || null,
      description: description || null,
      image: image || null,
      siteName: siteName || null,
      favicon,
      url,
    });
  } catch (err: any) {
    return c.json({ error: `获取链接预览失败: ${err.message}` }, 502);
  }
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
