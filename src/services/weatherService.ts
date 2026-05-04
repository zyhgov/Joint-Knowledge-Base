/**
 * 天气查询服务
 * 数据源：高德地图天气 API（https://restapi.amap.com/v3/weather/weatherInfo）
 * 在中国大陆可正常访问
 */

import type { LocationInfo } from './locationService'

const AMAP_KEY = '60c150c67d852ea0a8007989a71538a2'

export interface WeatherData {
  weather: string       // 天气现象，如"多云"
  temperature: string   // 实时气温
  winddirection: string // 风向
  windpower: string     // 风力
  humidity: string      // 湿度
  reporttime: string    // 数据发布时间
  city: string          // 城市名（中文）
  adcode: string
}

// 英文城市名 → { 中文名, adcode } 映射（常用城市）
const CITY_MAP: Record<string, { cn: string; adcode: string }> = {
  // 直辖市
  Beijing: { cn: '北京', adcode: '110000' },
  Shanghai: { cn: '上海', adcode: '310000' },
  Tianjin: { cn: '天津', adcode: '120000' },
  Chongqing: { cn: '重庆', adcode: '500000' },

  // 各省会/计划单列市
  Wuhan: { cn: '武汉', adcode: '420100' },
  Guangzhou: { cn: '广州', adcode: '440100' },
  Shenzhen: { cn: '深圳', adcode: '440300' },
  Hangzhou: { cn: '杭州', adcode: '330100' },
  Nanjing: { cn: '南京', adcode: '320100' },
  Chengdu: { cn: '成都', adcode: '510100' },
  XiAn: { cn: '西安', adcode: '610100' },
  Changsha: { cn: '长沙', adcode: '430100' },
  Zhengzhou: { cn: '郑州', adcode: '410100' },
  Shenyang: { cn: '沈阳', adcode: '210100' },
  Haerbin: { cn: '哈尔滨', adcode: '230100' },
  Changchun: { cn: '长春', adcode: '220100' },
  Jinan: { cn: '济南', adcode: '370100' },
  Qingdao: { cn: '青岛', adcode: '370200' },
  Fuzhou: { cn: '福州', adcode: '350100' },
  Xiamen: { cn: '厦门', adcode: '350200' },
  Hefei: { cn: '合肥', adcode: '340100' },
  Nanchang: { cn: '南昌', adcode: '360100' },
  Kunming: { cn: '昆明', adcode: '530100' },
  Guiyang: { cn: '贵阳', adcode: '520100' },
  Lanzhou: { cn: '兰州', adcode: '620100' },
  Taiyuan: { cn: '太原', adcode: '140100' },
  Shijiazhuang: { cn: '石家庄', adcode: '130100' },
  Nanning: { cn: '南宁', adcode: '450100' },
  Haikou: { cn: '海口', adcode: '460100' },
  Yinchuan: { cn: '银川', adcode: '640100' },
  Xining: { cn: '西宁', adcode: '630100' },
  Lhasa: { cn: '拉萨', adcode: '540100' },
  Urumqi: { cn: '乌鲁木齐', adcode: '650100' },
  Hohhot: { cn: '呼和浩特', adcode: '150100' },

  // 其他重要城市
  Suzhou: { cn: '苏州', adcode: '320500' },
  Wuxi: { cn: '无锡', adcode: '320200' },
  Ningbo: { cn: '宁波', adcode: '330200' },
  Wenzhou: { cn: '温州', adcode: '330300' },
  Dalian: { cn: '大连', adcode: '210200' },
  Zhuhai: { cn: '珠海', adcode: '440400' },
  Dongguan: { cn: '东莞', adcode: '441900' },
  Foshan: { cn: '佛山', adcode: '440600' },
  Huizhou: { cn: '惠州', adcode: '441300' },
  Zhongshan: { cn: '中山', adcode: '442000' },
  Xuzhou: { cn: '徐州', adcode: '320300' },
  Nantong: { cn: '南通', adcode: '320600' },
  Changzhou: { cn: '常州', adcode: '320400' },
  Guilin: { cn: '桂林', adcode: '450300' },
  Sanya: { cn: '三亚', adcode: '460200' },
  Luoyang: { cn: '洛阳', adcode: '410300' },
  Kaifeng: { cn: '开封', adcode: '410200' },
  Tangshan: { cn: '唐山', adcode: '130200' },
  Qinhuangdao: { cn: '秦皇岛', adcode: '130300' },
  Yantai: { cn: '烟台', adcode: '370600' },
  Weihai: { cn: '威海', adcode: '371000' },
  Zibo: { cn: '淄博', adcode: '370300' },
  Linyi: { cn: '临沂', adcode: '371300' },
  Liuzhou: { cn: '柳州', adcode: '450200' },
  Yangzhou: { cn: '扬州', adcode: '321000' },
  Zhenjiang: { cn: '镇江', adcode: '321100' },
  Zhuzhou: { cn: '株洲', adcode: '430200' },
  Xiangtan: { cn: '湘潭', adcode: '430300' },
  Yueyang: { cn: '岳阳', adcode: '430600' },
  Weifang: { cn: '潍坊', adcode: '370700' },
  Taian: { cn: '泰安', adcode: '370900' },
  Jinhua: { cn: '金华', adcode: '330700' },
  Shaoxing: { cn: '绍兴', adcode: '330600' },
  Jiaxing: { cn: '嘉兴', adcode: '330400' },
  Quanzhou: { cn: '泉州', adcode: '350500' },
  Zhangzhou: { cn: '漳州', adcode: '350600' },
  Mianyang: { cn: '绵阳', adcode: '510700' },
  Deyang: { cn: '德阳', adcode: '510600' },
  Yibin: { cn: '宜宾', adcode: '511500' },
  Nanchong: { cn: '南充', adcode: '511300' },
  Zunyi: { cn: '遵义', adcode: '520300' },
  Dali: { cn: '大理', adcode: '532900' },
  Lijiang: { cn: '丽江', adcode: '530700' },
  Zhangjiajie: { cn: '张家界', adcode: '430800' },
}

// 省份英文名 → 中文名 + 省级 adcode（兜底）
const PROV_MAP: Record<string, { cn: string; adcode: string }> = {
  Hubei: { cn: '湖北', adcode: '420000' },
  Guangdong: { cn: '广东', adcode: '440000' },
  Zhejiang: { cn: '浙江', adcode: '330000' },
  Jiangsu: { cn: '江苏', adcode: '320000' },
  Sichuan: { cn: '四川', adcode: '510000' },
  Shaanxi: { cn: '陕西', adcode: '610000' },
  Hunan: { cn: '湖南', adcode: '430000' },
  Henan: { cn: '河南', adcode: '410000' },
  Shandong: { cn: '山东', adcode: '370000' },
  Liaoning: { cn: '辽宁', adcode: '210000' },
  Heilongjiang: { cn: '黑龙江', adcode: '230000' },
  Jilin: { cn: '吉林', adcode: '220000' },
  Fujian: { cn: '福建', adcode: '350000' },
  Anhui: { cn: '安徽', adcode: '340000' },
  Jiangxi: { cn: '江西', adcode: '360000' },
  Yunnan: { cn: '云南', adcode: '530000' },
  Guizhou: { cn: '贵州', adcode: '520000' },
  Gansu: { cn: '甘肃', adcode: '620000' },
  Shanxi: { cn: '山西', adcode: '140000' },
  Hebei: { cn: '河北', adcode: '130000' },
  Guangxi: { cn: '广西', adcode: '450000' },
  Hainan: { cn: '海南', adcode: '460000' },
  Ningxia: { cn: '宁夏', adcode: '640000' },
  Qinghai: { cn: '青海', adcode: '630000' },
  Xizang: { cn: '西藏', adcode: '540000' },
  Tibet: { cn: '西藏', adcode: '540000' },
  Xinjiang: { cn: '新疆', adcode: '650000' },
  NeiMongol: { cn: '内蒙古', adcode: '150000' },
  InnerMongolia: { cn: '内蒙古', adcode: '150000' },
}

function normalizeCityName(eng: string): string {
  // 处理带空格或连字符的英文名，如 "Xi'an" → "XiAn"
  return eng
    .replace(/[''`]/g, '')
    .replace(/[-_\s]+/g, '')
    .trim()
}

function lookupAdcode(city: string, prov: string): { cn: string; adcode: string } | null {
  const normCity = normalizeCityName(city)
  const normProv = normalizeCityName(prov)

  // 先查城市
  const cityEntry = CITY_MAP[normCity]
  if (cityEntry) return cityEntry

  // 再查省份
  const provEntry = PROV_MAP[normProv]
  if (provEntry) return provEntry

  return null
}

/** 天气数据缓存（5分钟） */
let cachedWeather: { data: WeatherData; time: number } | null = null
const WEATHER_CACHE_TTL = 5 * 60_000

/**
 * 查询实时天气
 * @param location ipinfo.io 返回的位置信息
 */
export async function fetchWeather(location: LocationInfo): Promise<WeatherData | null> {
  // 缓存命中
  if (cachedWeather && Date.now() - cachedWeather.time < WEATHER_CACHE_TTL) {
    return cachedWeather.data
  }

  // 查城市映射
  const entry = lookupAdcode(location.city, location.prov)
  if (!entry) {
    console.warn('[WeatherService] 未找到城市映射:', location.city, location.prov)
    return null
  }

  try {
    const url = `https://restapi.amap.com/v3/weather/weatherInfo?key=${AMAP_KEY}&city=${entry.adcode}&extensions=base&output=JSON`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    const data = await res.json()

    console.debug('[WeatherService] 高德天气返回:', data)

    if (data.status !== '1' || !data.lives?.length) {
      throw new Error(data.info || '天气查询失败')
    }

    const live = data.lives[0]
    const weather: WeatherData = {
      weather: live.weather || '未知',
      temperature: live.temperature || '--',
      winddirection: live.winddirection || '--',
      windpower: live.windpower || '--',
      humidity: live.humidity || '--',
      reporttime: live.reporttime || '',
      city: live.city || entry.cn,
      adcode: live.adcode || entry.adcode,
    }

    cachedWeather = { data: weather, time: Date.now() }
    return weather
  } catch (err) {
    console.warn('[WeatherService] 天气查询失败:', err)
    return null
  }
}

/** 清除天气缓存 */
export function clearWeatherCache() {
  cachedWeather = null
}
