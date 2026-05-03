// lunar-javascript 类型声明
declare module 'lunar-javascript' {
  export class Solar {
    static fromYmd(year: number, month: number, day: number): Solar
    getYear(): number
    getMonth(): number
    getDay(): number
    getWeekInChinese(): string
    toFullString(): string
    getLunar(): Lunar
  }

  export class Lunar {
    getYear(): number
    getMonth(): number
    getDay(): number
    getYearInChinese(): string
    getMonthInChinese(): string
    getDayInChinese(): string
    getYearShengXiao(): string
    getDayYi(): string[]
    getDayJi(): string[]
    getJieQi(): string
    toFullString(): string
  }
}
