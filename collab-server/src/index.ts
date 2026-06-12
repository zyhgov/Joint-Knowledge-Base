import { Hono } from "hono";
import { YDurableObjects, yRoute } from "y-durableobjects";
import { cors } from "hono/cors";

// 内存封禁列表（key: `spreadsheetId:userId`, value: reason）
const bannedUsers = new Map<string, string>()

// 简易 Supabase token 验证（复用 JWT）
async function verifyToken(token: string, env: any): Promise<{ user_id: string } | null> {
  try {
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: env.SUPABASE_ANON_KEY,
      },
    })
    if (!res.ok) return null
    const data = await res.json() as any
    return { user_id: data.id }
  } catch {
    return null
  }
}

type Bindings = {
  Y_DURABLE_OBJECTS: DurableObjectNamespace<YDurableObjects<Env>>;
  VOLC_API_KEY: string;
  VOLC_MODEL: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_KEY: string;
  TRANSFER_BUCKET: R2Bucket;
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

// ====== 表格用户封禁/踢出管理 ======

// 封禁用户
app.post("/api/spreadsheet/:id/ban", async (c) => {
  const { id } = c.req.param()
  const { user_id } = await c.req.json()
  if (!user_id) return c.json({ error: "缺少 user_id" }, 400)
  
  const key = `${id}:${user_id}`
  bannedUsers.set(key, "banned")
  
  // 同时持久化到 Supabase
  try {
    await fetch(`${c.env.SUPABASE_URL}/rest/v1/spreadsheet_bans`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": c.env.SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${c.env.SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        spreadsheet_id: id,
        user_id,
        banned_by: "server",
      }),
    })
  } catch {}
  
  return c.json({ ok: true, action: "ban" })
})

// 解封用户
app.post("/api/spreadsheet/:id/unban", async (c) => {
  const { id } = c.req.param()
  const { user_id } = await c.req.json()
  if (!user_id) return c.json({ error: "缺少 user_id" }, 400)
  
  const key = `${id}:${user_id}`
  bannedUsers.delete(key)
  
  // 从 Supabase 删除封禁记录
  try {
    await fetch(`${c.env.SUPABASE_URL}/rest/v1/spreadsheet_bans?spreadsheet_id=eq.${id}&user_id=eq.${user_id}`, {
      method: "DELETE",
      headers: {
        "apikey": c.env.SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${c.env.SUPABASE_ANON_KEY}`,
      },
    })
  } catch {}
  
  return c.json({ ok: true, action: "unban" })
})

// 踢出用户（先封禁，再断开连接）
app.post("/api/spreadsheet/:id/kick", async (c) => {
  const { id } = c.req.param()
  const { user_id } = await c.req.json()
  if (!user_id) return c.json({ error: "缺少 user_id" }, 400)
  
  // 踢出 = 临时封禁（用户必须重连才能恢复）
  const key = `${id}:${user_id}`
  bannedUsers.set(key, "kicked")
  
  return c.json({ ok: true, action: "kick" })
})

// ====== 附件自动清理（7天过期） ======

async function cleanupExpiredAttachments(env: Bindings): Promise<{ deleted: number; errors: number }> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  let deleted = 0
  let errors = 0

  try {
    // 查询7天前的、仍有附件的工单
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/transfer_fan_orders?created_at=lt.${sevenDaysAgo}&attachment_urls=not.eq.%5B%5D&select=id,attachment_urls`,
      {
        headers: {
          'apikey': env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    )

    if (!res.ok) {
      console.error('Failed to query orders:', await res.text())
      return { deleted, errors: 1 }
    }

    const orders = await res.json() as Array<{ id: string; attachment_urls: Array<{ url: string; key: string; uploaded_at: string }> }>

    for (const order of orders) {
      if (!order.attachment_urls || order.attachment_urls.length === 0) continue

      // 从 R2 删除每个附件
      for (const att of order.attachment_urls) {
        try {
          if (att.key) {
            await env.TRANSFER_BUCKET.delete(att.key)
            deleted++
          }
        } catch (e) {
          console.error(`Failed to delete R2 key ${att.key}:`, e)
          errors++
        }
      }

      // 将 attachment_urls 更新为空数组，避免重复删除
      try {
        await fetch(`${env.SUPABASE_URL}/rest/v1/transfer_fan_orders?id=eq.${order.id}`, {
          method: 'PATCH',
          headers: {
            'apikey': env.SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({ attachment_urls: [] }),
        })
      } catch (e) {
        console.error(`Failed to update order ${order.id}:`, e)
        errors++
      }
    }
  } catch (e) {
    console.error('Cleanup error:', e)
    errors++
  }

  return { deleted, errors }
}

// Yjs 协作路由 - WebSocket 连接端点
// 客户端通过 ws://host/editor/{docId} 连接
const route = app.route(
  "/editor",
  yRoute<Env>((env) => env.Y_DURABLE_OBJECTS),
);

// Cron 触发路由 - 手动触发清理（仅限管理员）
app.post('/api/cron/cleanup-attachments', async (c) => {
  const auth = c.req.header('Authorization')
  if (auth !== `Bearer ${c.env.SUPABASE_SERVICE_KEY}`) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  const result = await cleanupExpiredAttachments(c.env)
  return c.json(result)
})

// 转粉截图附件每日统计
app.get('/api/transfer-attachment-stats', async (c) => {
  const dailyMap = new Map<string, { count: number; sizeBytes: number }>()
  let totalCount = 0
  let totalSizeBytes = 0

  try {
    let cursor: string | undefined
    do {
      const list = await c.env.TRANSFER_BUCKET.list({
        prefix: 'transfer-attachments/',
        cursor,
      })

      for (const obj of list.objects) {
        const date = ((obj.uploaded ? new Date(obj.uploaded).toISOString() : new Date().toISOString())).slice(0, 10)
        const existing = dailyMap.get(date) || { count: 0, sizeBytes: 0 }
        existing.count++
        existing.sizeBytes += obj.size
        dailyMap.set(date, existing)
        totalCount++
        totalSizeBytes += obj.size
      }

      cursor = list.truncated ? list.cursor : undefined
    } while (cursor)
  } catch (e) {
    console.error('Failed to list R2 attachments:', e)
    return c.json({ error: 'Failed to list attachments' }, 500)
  }

  const dailyStats = Array.from(dailyMap.entries())
    .map(([date, stats]) => ({ date, ...stats }))
    .sort((a, b) => a.date.localeCompare(b.date))

  return c.json({ dailyStats, totalCount, totalSizeBytes })
})

export default {
  fetch: route.fetch.bind(route),
  scheduled: async (_event: ScheduledEvent, env: Bindings, _ctx: ExecutionContext) => {
    console.log('[Cron] Starting attachment cleanup...')
    const result = await cleanupExpiredAttachments(env)
    console.log(`[Cron] Cleanup complete: ${result.deleted} deleted, ${result.errors} errors`)
  },
}
export type AppType = typeof route;
export { YDurableObjects };
