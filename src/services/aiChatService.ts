export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

const VOLC_API_KEY = 'ark-c7796a51-b342-4672-9270-e8d6a2bae2bd-28c1a'
const VOLC_MODEL = 'doubao-seed-2-0-mini-260215'
const VOLC_API_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions'

export const aiChatService = {
  // 发送消息并流式接收回复
  sendMessage: async (
    messages: { role: string; content: string }[],
    onChunk: (text: string) => void,
    onDone: () => void,
    onError: (err: Error) => void,
    signal?: AbortSignal
  ): Promise<void> => {
    try {
      const response = await fetch(VOLC_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${VOLC_API_KEY}`,
        },
        body: JSON.stringify({
          model: VOLC_MODEL,
          messages: [
            { content: 'You are a helpful assistant.', role: 'system' },
            ...messages,
          ],
          stream: true,
        }),
        signal,
      })

      if (!response.ok) {
        const errText = await response.text().catch(() => '')
        let errMsg = `请求失败 (${response.status})`
        try {
          const errJson = JSON.parse(errText)
          errMsg = errJson?.error?.message || errJson?.error || errMsg
        } catch {}
        throw new Error(errMsg)
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('无法读取响应流')
      }

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // 保留不完整的行

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || trimmed === 'data: [DONE]') continue
          if (!trimmed.startsWith('data: ')) continue

          try {
            const jsonStr = trimmed.slice(6)
            const data = JSON.parse(jsonStr)
            const content = data?.choices?.[0]?.delta?.content || ''
            if (content) {
              onChunk(content)
            }
          } catch {
            // 忽略解析错误
          }
        }
      }

      onDone()
    } catch (err: any) {
      if (err.name === 'AbortError') return
      onError(err instanceof Error ? err : new Error(String(err)))
    }
  },
}
