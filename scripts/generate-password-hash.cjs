const bcrypt = require('bcryptjs')

async function generateHash() {
  const password = 'zyh040410'
  const salt = await bcrypt.genSalt(10)
  const hash = await bcrypt.hash(password, salt)
  
  console.log('\n' + '='.repeat(60))
  console.log('密码哈希生成完成')
  console.log('='.repeat(60))
  console.log('\n密码:', password)
  console.log('\n生成的哈希值:')
  console.log(hash)
  console.log('\n' + '='.repeat(60))
  console.log('以下是 SQL 语句，复制到 Supabase SQL Editor 执行:')
  console.log('='.repeat(60))
  console.log(`
INSERT INTO jkb_users (id, phone, password_hash, display_name, role, is_active)
VALUES (
  '${generateUUID()}',
  '18833613517',
  '${hash}',
  '杖雍皓',
  'super_admin',
  true
)
ON CONFLICT (phone) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  display_name = EXCLUDED.display_name,
  role = EXCLUDED.role;

-- 验证
SELECT id, phone, display_name, role, is_active FROM jkb_users WHERE phone = '18833613517';
  `)
  console.log('='.repeat(60) + '\n')
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

generateHash().catch(console.error)