/**
 * 回填已有转粉截图的文件大小
 * 
 * 遍历 transfer_fan_orders 表中含 attachment_urls 的记录，
 * 通过 HEAD 请求获取文件大小后更新到数据库。
 * 
 * 用法: node scripts/backfill-attachment-sizes.mjs
 */
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://hsgahqjexhmnvzpiybtd.supabase.co'
const supabaseKey = process.env.SUPABASE_SERVICE_KEY

if (!supabaseKey) {
  console.error('请先设置 SUPABASE_SERVICE_KEY 环境变量')
  console.error('用法: $env:SUPABASE_SERVICE_KEY="..." ; node scripts/backfill-attachment-sizes.mjs')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function getFileSize(url) {
  try {
    const res = await fetch(url, { method: 'HEAD' })
    if (res.ok) {
      const size = parseInt(res.headers.get('content-length') || '0', 10)
      return size || 0
    }
    return 0
  } catch {
    return 0
  }
}

async function main() {
  console.log('查询已有附件的工单...')
  const { data: orders, error } = await supabase
    .from('transfer_fan_orders')
    .select('id, attachment_urls')
    .not('attachment_urls', 'is', null)
    .not('attachment_urls', 'eq', '[]')

  if (error) {
    console.error('查询失败:', error.message)
    process.exit(1)
  }

  console.log(`找到 ${orders.length} 个工单有附件`)

  let totalUpdated = 0

  for (const order of orders) {
    const urls = order.attachment_urls
    if (!urls || urls.length === 0) continue

    let hasChange = false

    for (const att of urls) {
      if (att.size != null && att.size > 0) continue // 已有大小则跳过
      const size = await getFileSize(att.url)
      if (size > 0) {
        att.size = size
        hasChange = true
        console.log(`  [${order.id.slice(0, 8)}] ${att.key || att.url.slice(-20)} → ${(size / 1024).toFixed(1)} KB`)
      }
    }

    if (hasChange) {
      const { error: updateError } = await supabase
        .from('transfer_fan_orders')
        .update({ attachment_urls: urls, updated_at: new Date().toISOString() })
        .eq('id', order.id)

      if (updateError) {
        console.error(`  更新失败 [${order.id.slice(0, 8)}]: ${updateError.message}`)
      } else {
        totalUpdated++
      }
    }
  }

  console.log(`\n完成！共更新 ${totalUpdated} 个工单的附件大小`)
}

main().catch(console.error)
