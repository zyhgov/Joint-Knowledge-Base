import { Solar } from 'lunar-javascript'

export interface TodayInfo {
  /** 公历日期：2026年4月30日 星期四 */
  gregorian: string
  /** 农历：二〇二六年三月十四 */
  lunar: string
  /** 生肖：马 */
  shengxiao: string
  /** 今日宜 */
  yi: string[]
  /** 今日忌 */
  ji: string[]
  /** 节气（没有则为空） */
  jieqi: string
}

export function getTodayInfo(): TodayInfo {
  const now = new Date()
  const solar = Solar.fromYmd(now.getFullYear(), now.getMonth() + 1, now.getDate())
  const lunar = solar.getLunar()
  const weekMap: Record<string, string> = {
    '一': '星期一',
    '二': '星期二',
    '三': '星期三',
    '四': '星期四',
    '五': '星期五',
    '六': '星期六',
    '日': '星期日',
  }
  const weekChar = solar.getWeekInChinese()
  const weekStr = weekMap[weekChar] || `星期${weekChar}`

  return {
    gregorian: `公历 ${solar.getYear()} 年 ${solar.getMonth()} 月 ${solar.getDay()} 日 ${weekStr}`,
    lunar: `农历${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`,
    shengxiao: lunar.getYearShengXiao(),
    yi: lunar.getDayYi(),
    ji: lunar.getDayJi(),
    jieqi: lunar.getJieQi(),
  }
}

/** 所有可用的背景图列表 */
export const CARD_BG_IMAGES = [
    '/card-bg/chunniao.jpg',
    '/card-bg/chushuifurong.jpg',
    '/card-bg/Gleaners.jpg',
    '/card-bg/huaniao.jpg',
    '/card-bg/Impression-sunrise.jpg',
    '/card-bg/Landscape-with-Sheep.jpg',
    '/card-bg/lianhua.jpg',
    '/card-bg/meihua.jpg',
    '/card-bg/Sailboats-on-Calm-Seas.jpg',
    '/card-bg/Starry-Night-Over-the-Rhone.jpg',
    '/card-bg/taoniao.jpg',
    '/card-bg/The-Bridge-at-Argenteuil.jpg',
    '/card-bg/The-Great-Wave-off-Kanagawa.jpg',
    '/card-bg/The-Persistence-of-Memory.jpg',
    '/card-bg/The-School-of-Athens.jpg',
    '/card-bg/wanguolaichao.jpg',
    '/card-bg/Washington-Crossing-the-Delaware.jpg',
    '/card-bg/yazi.jpg',
    '/card-bg/qmsht.jpg',
    '/card-bg/buniantu.jpg',
    '/card-bg/hxzyyt.jpg',
    '/card-bg/qljst.jpg',
]

/** 从 /card-bg/ 中随机选一张背景图 */
export function getRandomCardBg(): string {
  return CARD_BG_IMAGES[Math.floor(Math.random() * CARD_BG_IMAGES.length)]
}

/** 获取下一张背景图（循环） */
export function getNextCardBg(current: string): string {
  const idx = CARD_BG_IMAGES.indexOf(current)
  if (idx === -1) return CARD_BG_IMAGES[0]
  return CARD_BG_IMAGES[(idx + 1) % CARD_BG_IMAGES.length]
}
