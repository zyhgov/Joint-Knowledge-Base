import bcrypt from 'bcryptjs'

export const cryptoService = {
  // 生成密码哈希值
  hashPassword: async (password: string): Promise<string> => {
    const salt = await bcrypt.genSalt(10)
    return bcrypt.hash(password, salt)
  },

  // 验证密码
  verifyPassword: async (password: string, hash: string): Promise<boolean> => {
    return bcrypt.compare(password, hash)
  },

  // 生成 JWT Token
  generateToken: (): string => {
    return `${Date.now()}_${Math.random().toString(36).substring(2, 15)}_${Math.random().toString(36).substring(2, 15)}`
  },
}