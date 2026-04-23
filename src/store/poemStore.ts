import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface PoemItem {
  id: string
  text: string    // 古诗内容
  author: string  // 作者
  enabled: boolean
  pinned: boolean // 置顶：置顶的诗词优先出现
  weight: number  // 权重 1~10，默认1，数值越大出现概率越高
}

const DEFAULT_POEMS: PoemItem[] = [
  { id: '1', text: '大漠孤烟直，长河落日圆。', author: '王维', enabled: true, pinned: false, weight: 1 },
  { id: '2', text: '会当凌绝顶，一览众山小。', author: '杜甫', enabled: true, pinned: false, weight: 1 },
  { id: '3', text: '海上生明月，天涯共此时。', author: '张九龄', enabled: true, pinned: false, weight: 1 },
  { id: '4', text: '沉舟侧畔千帆过，病树前头万木春。', author: '刘禹锡', enabled: true, pinned: false, weight: 1 },
  { id: '5', text: '山重水复疑无路，柳暗花明又一村。', author: '陆游', enabled: true, pinned: false, weight: 1 },
  { id: '6', text: '长风破浪会有时，直挂云帆济沧海。', author: '李白', enabled: true, pinned: false, weight: 1 },
  { id: '7', text: '不畏浮云遮望眼，自缘身在最高层。', author: '王安石', enabled: true, pinned: false, weight: 1 },
  { id: '8', text: '欲穷千里目，更上一层楼。', author: '王之涣', enabled: true, pinned: false, weight: 1 },
  { id: '9', text: '千磨万击还坚劲，任尔东西南北风。', author: '郑燮', enabled: true, pinned: false, weight: 1 },
  { id: '10', text: '天生我材必有用，千金散尽还复来。', author: '李白', enabled: true, pinned: false, weight: 1 },
]

interface PoemStore {
  poems: PoemItem[]
  addPoem: (poem: Omit<PoemItem, 'id'>) => void
  updatePoem: (id: string, data: Partial<PoemItem>) => void
  deletePoem: (id: string) => void
  togglePoem: (id: string) => void
  togglePinned: (id: string) => void
  setWeight: (id: string, weight: number) => void
  reorderPoems: (fromIndex: number, toIndex: number) => void
  getRandomPoem: () => PoemItem | null
  getWeightedRandomPoem: (excludeId?: string) => PoemItem | null
  getEnabledPoems: () => PoemItem[]
}

export const usePoemStore = create<PoemStore>()(
  persist(
    (set, get) => ({
      poems: DEFAULT_POEMS,

      addPoem: (poem) => {
        const id = Date.now().toString()
        set((state) => ({
          poems: [...state.poems, { ...poem, id }],
        }))
      },

      updatePoem: (id, data) => {
        set((state) => ({
          poems: state.poems.map((p) => (p.id === id ? { ...p, ...data } : p)),
        }))
      },

      deletePoem: (id) => {
        set((state) => ({
          poems: state.poems.filter((p) => p.id !== id),
        }))
      },

      togglePoem: (id) => {
        set((state) => ({
          poems: state.poems.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p)),
        }))
      },

      togglePinned: (id) => {
        set((state) => ({
          poems: state.poems.map((p) => (p.id === id ? { ...p, pinned: !p.pinned } : p)),
        }))
      },

      setWeight: (id, weight) => {
        set((state) => ({
          poems: state.poems.map((p) => (p.id === id ? { ...p, weight: Math.max(1, Math.min(10, weight)) } : p)),
        }))
      },

      reorderPoems: (fromIndex, toIndex) => {
        set((state) => {
          const newPoems = [...state.poems]
          const [moved] = newPoems.splice(fromIndex, 1)
          newPoems.splice(toIndex, 0, moved)
          return { poems: newPoems }
        })
      },

      getRandomPoem: () => {
        const { poems } = get()
        const enabled = poems.filter((p) => p.enabled)
        if (enabled.length === 0) return null
        return enabled[Math.floor(Math.random() * enabled.length)]
      },

      // 加权随机选取：pinned 优先，weight 决定概率
      getWeightedRandomPoem: (excludeId?: string) => {
        const { poems } = get()
        const enabled = poems.filter((p) => p.enabled && p.id !== excludeId)
        if (enabled.length === 0) {
          // 如果排除后没有可用的，尝试不排除
          const allEnabled = poems.filter((p) => p.enabled)
          if (allEnabled.length === 0) return null
          // 从所有启用的中选
          const pinned = allEnabled.filter((p) => p.pinned)
          if (pinned.length > 0) {
            return pinned[Math.floor(Math.random() * pinned.length)]
          }
          return allEnabled[Math.floor(Math.random() * allEnabled.length)]
        }

        // 置顶诗词有 60% 概率被选中（如果存在置顶诗词）
        const pinned = enabled.filter((p) => p.pinned)
        if (pinned.length > 0 && Math.random() < 0.6) {
          return pinned[Math.floor(Math.random() * pinned.length)]
        }

        // 按权重随机选取
        const totalWeight = enabled.reduce((sum, p) => sum + (p.weight || 1), 0)
        let random = Math.random() * totalWeight
        for (const p of enabled) {
          random -= (p.weight || 1)
          if (random <= 0) return p
        }
        return enabled[enabled.length - 1]
      },

      getEnabledPoems: () => {
        const { poems } = get()
        return poems.filter((p) => p.enabled)
      },
    }),
    {
      name: 'poem-store',
      version: 2,
      // 迁移：为旧数据添加 pinned 和 weight 字段
      migrate: (persistedState: any, version: number) => {
        if (version < 2) {
          const state = persistedState as { poems: any[] }
          if (state.poems) {
            state.poems = state.poems.map((p: any) => ({
              ...p,
              pinned: p.pinned ?? false,
              weight: p.weight ?? 1,
            }))
          }
        }
        return persistedState
      },
    }
  )
)
