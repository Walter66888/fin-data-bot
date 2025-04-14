/**
 * 證交所 API 模組
 * 負責從台灣證券交易所開放 API 獲取資料
 */

const axios = require('axios');
const logger = require('../utils/logger');
const { format, parse, isValid } = require('date-fns');

// 舊版 API 基礎 URL
const OLD_BASE_URL = 'https://openapi.twse.com.tw/v1';

// 新版官方網站 API 基礎 URL
const OFFICIAL_BASE_URL = 'https://www.twse.com.tw/rwd/zh';

/**
 * 舊版 API 請求函數
 * 
 * @param {string} endpoint API 端點
 * @returns {Promise<Object|null>} API 回應的資料及相關資訊，如果請求失敗則返回 null
 */
async function fetchOldAPI(endpoint) {
  try {
    // 生成時間戳參數，確保每次請求都獲取最新資料而非快取
    const timestamp = new Date().getTime();
    const url = `${OLD_BASE_URL}/${endpoint}?_=${timestamp}`;
    logger.debug(`正在請求舊版 API: ${url}`);
    
    // 標準請求頭，強制禁用快取
    const headers = {
      'accept': 'application/json',
      'If-Modified-Since': '0',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    };
    
    const response = await axios.get(url, { headers });
    
    // 檢查回應狀態
    if (response.status !== 200) {
      logger.error(`舊版 API 請求失敗: ${url}, 狀態碼: ${response.status}`);
      return null;
    }
    
    // 記錄 Last-Modified 時間
    const lastModified = response.headers['last-modified'];
    if (lastModified) {
      logger.debug(`舊版 API ${endpoint} 資料更新時間: ${lastModified}`);
    }
    
    // 記錄返回的數據條數，增加診斷資訊
    if (response.data && Array.isArray(response.data)) {
      logger.debug(`舊版 API ${endpoint} 返回 ${response.data.length} 條數據`);
      // 記錄第一條數據的日期，用於檢查是否為最新
      if (response.data.length > 0 && response.data[0].Date) {
        logger.info(`舊版 API ${endpoint} 返回的最新日期: ${response.data[0].Date}`);
      }
    }
    
    return {
      data: response.data,
      lastModified,
      headers: response.headers
    };
  } catch (error) {
    logger.error(`調用舊版 API ${endpoint} 時發生錯誤:`, error);
    return null;
  }
}

/**
 * 官方網站 API 請求函數
 * 
 * @param {string} endpoint API 端點
 * @param {Object} params 參數物件
 * @returns {Promise<Object|null>} API 回應的資料，如果請求失敗則返回 null
 */
async function fetchOfficialAPI(endpoint, params = {}) {
  try {
    // 生成時間戳參數，確保每次請求都獲取最新資料而非快取
    const timestamp = new Date().getTime();
    // 基本參數
    const baseParams = {
      '_': timestamp,
      'response': 'json'
    };
    
    // 合併參數
    const queryParams = new URLSearchParams({
      ...baseParams,
      ...params
    });
    
    const url = `${OFFICIAL_BASE_URL}/${endpoint}?${queryParams.toString()}`;
    logger.debug(`正在請求官方網站 API: ${url}`);
    
    // 標準請求頭，強制禁用快取
    const headers = {
      'accept': 'application/json',
      'If-Modified-Since': '0',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'User-Agent': 'Mozilla/5.0 (compatible; FinDataBot/1.0;)'
    };
    
    const response = await axios.get(url, { headers });
    
    // 檢查回應狀態
    if (response.status !== 200) {
      logger.error(`官方網站 API 請求失敗: ${url}, 狀態碼: ${response.status}`);
      return null;
    }
    
    // 檢查 API 回應是否正常
    if (response.data && response.data.stat === 'OK') {
      logger.debug(`官方網站 API ${endpoint} 請求成功, 日期: ${response.data.date}`);
      
      // 如果回應包含資料陣列
      if (response.data.data && Array.isArray(response.data.data)) {
        logger.debug(`官方網站 API ${endpoint} 返回 ${response.data.data.length} 條數據`);
      }
      
      return response.data;
    } else {
      logger.error(`官方網站 API ${endpoint} 回應異常: ${JSON.stringify(response.data)}`);
      return null;
    }
  } catch (error) {
    logger.error(`調用官方網站 API ${endpoint} 時發生錯誤:`, error);
    return null;
  }
}

/**
 * 獲取休市日期資料 (使用舊版 API)
 * @returns {Promise<Array|null>} 休市日期資料，如果請求失敗則返回 null
 */
async function getHolidaySchedule() {
  const result = await fetchOldAPI('holidaySchedule/holidaySchedule');
  return result ? result.data : null;
}

/**
 * 獲取集中市場每日成交資訊 (使用舊版 API)
 * @returns {Promise<Array|null>} 市場成交資訊，如果請求失敗則返回 null
 */
async function getDailyMarketInfo() {
  const result = await fetchOldAPI('exchangeReport/FMTQIK');
  return result ? result.data : null;
}

/**
 * 獲取集中市場每日成交資訊 (使用官方網站 API)
 * @returns {Promise<Object|null>} 市場成交資訊，如果請求失敗則返回 null
 */
async function getOfficialDailyMarketInfo() {
  // 不傳入特定日期參數，API 會返回該月份所有交易日資料
  return await fetchOfficialAPI('afterTrading/FMTQIK');
}

/**
 * 檢查 API 資料是否已更新
 * 通過 HEAD 請求檢查 Last-Modified 時間
 * 
 * @param {string} endpoint API 端點
 * @returns {Promise<boolean>} 如果資料已更新返回 true，否則返回 false
 */
async function checkDataUpdated(endpoint) {
  try {
    // 添加時間戳參數，防止快取
    const timestamp = new Date().getTime();
    const url = `${OLD_BASE_URL}/${endpoint}?_=${timestamp}`;
    
    // 強制禁用快取的請求頭
    const headers = {
      'accept': 'application/json',
      'If-Modified-Since': '0',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    };
    
    const response = await axios.head(url, { headers });
    
    // 獲取 Last-Modified 頭
    const lastModified = response.headers['last-modified'];
    if (!lastModified) {
      logger.warn(`API ${endpoint} 沒有提供 Last-Modified 頭`);
      return false;
    }
    
    // 解析 Last-Modified 時間
    const lastModifiedDate = new Date(lastModified);
    
    // 檢查是否為今天更新的
    const today = new Date();
    const isToday = (
      lastModifiedDate.getDate() === today.getDate() &&
      lastModifiedDate.getMonth() === today.getMonth() &&
      lastModifiedDate.getFullYear() === today.getFullYear()
    );
    
    if (isToday) {
      logger.info(`API ${endpoint} 已於今天 ${lastModifiedDate.toTimeString()} 更新`);
      return true;
    } else {
      logger.info(`API ${endpoint} 最後更新於 ${lastModifiedDate.toISOString()}，尚未更新今日資料`);
      return false;
    }
  } catch (error) {
    logger.error(`檢查 API ${endpoint} 資料更新時發生錯誤:`, error);
    return false;
  }
}

/**
 * 標準化日期格式（將可能的各種格式轉換為YYYY-MM-DD）
 * 
 * @param {string} dateStr 原始日期字串
 * @returns {string} 標準化的日期字串 (YYYY-MM-DD)
 */
function standardizeDate(dateStr) {
  if (!dateStr) return '';
  
  // 處理中華民國年份格式（例如 114/04/01）
  if (dateStr.includes('/')) {
    try {
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        const rocYear = parseInt(parts[0], 10);
        const month = parts[1].padStart(2, '0');
        const day = parts[2].padStart(2, '0');
        const westernYear = rocYear + 1911;
        return `${westernYear}-${month}-${day}`;
      }
    } catch (e) {
      logger.warn(`無法解析ROC日期格式(斜線分隔): ${dateStr}`, e);
    }
  }
  
  // 處理中華民國年份格式（例如 1140401）
  if (dateStr.length === 7 && !dateStr.includes('-')) {
    try {
      const rocYear = parseInt(dateStr.substring(0, 3), 10);
      const month = dateStr.substring(3, 5);
      const day = dateStr.substring(5, 7);
      const westernYear = rocYear + 1911;
      return `${westernYear}-${month}-${day}`;
    } catch (e) {
      logger.warn(`無法解析ROC日期格式: ${dateStr}`, e);
      // 繼續嘗試其他格式
    }
  }
  
  // 處理西元年份格式（例如 20250401）
  if (dateStr.length === 8 && !dateStr.includes('-')) {
    try {
      const year = dateStr.substring(0, 4);
      const month = dateStr.substring(4, 6);
      const day = dateStr.substring(6, 8);
      
      // 使用date-fns驗證日期有效性
      const parsedDate = parse(`${year}-${month}-${day}`, 'yyyy-MM-dd', new Date());
      if (isValid(parsedDate)) {
        return `${year}-${month}-${day}`;
      }
    } catch (e) {
      logger.warn(`無法解析西元日期格式: ${dateStr}`, e);
      // 繼續嘗試其他格式
    }
  }
  
  // 檢查是否已經是標準格式 (YYYY-MM-DD)
  if (dateStr.includes('-') && dateStr.length === 10) {
    try {
      const parsedDate = parse(dateStr, 'yyyy-MM-dd', new Date());
      if (isValid(parsedDate)) {
        return dateStr;
      }
    } catch (e) {
      logger.warn(`無法解析標準日期格式: ${dateStr}`, e);
      // 繼續處理
    }
  }
  
  // 最後嘗試讓JavaScript自己解析
  try {
    const date = new Date(dateStr);
    if (isValid(date)) {
      return format(date, 'yyyy-MM-dd');
    }
  } catch (e) {
    logger.warn(`無法自動解析日期: ${dateStr}`, e);
  }
  
  // 如果所有嘗試都失敗，記錄警告並返回原始字串
  logger.warn(`無法標準化日期格式: ${dateStr}`);
  return dateStr;
}

/**
 * 處理每日市場資訊資料 (舊版 API)
 * 將原始資料轉換為更易使用的格式
 * 
 * @param {Array} data 原始 API 資料
 * @returns {Object|null} 處理後的資料，如果轉換失敗則返回 null
 */
function processDailyMarketInfo(data) {
  if (!data || !Array.isArray(data) || data.length === 0) {
    logger.error('處理每日市場資訊時收到無效資料');
    return null;
  }
  
  try {
    // 找出最新的日期資料
    let latestDate = '';
    let latestData = null;
    
    // 記錄所有日期用於診斷
    const allDates = data.map(item => item.Date);
    logger.info(`API 返回的所有日期: ${allDates.join(', ')}`);
    
    // 找出最新的日期資料
    for (const item of data) {
      const standardizedDate = standardizeDate(item.Date);
      // 比較標準化後的日期字串
      if (standardizedDate > latestDate) {
        latestDate = standardizedDate;
        latestData = item;
      }
    }
    
    if (!latestData) {
      logger.error('無法確定最新的市場資料');
      return null;
    }
    
    logger.info(`找到最新日期資料: ${latestData.Date} (標準化為: ${latestDate})`);
    
    // 轉換為數字型別並移除千分位符號
    const result = {
      date: latestDate,
      market: {
        tradeVolume: parseFloat(latestData.TradeVolume.replace(/,/g, '')) / 100000000, // 轉為億股
        tradeValue: parseFloat(latestData.TradeValue.replace(/,/g, '')) / 100000000, // 轉為億元
        transaction: parseFloat(latestData.Transaction.replace(/,/g, '')) / 1000 // 轉為千筆
      },
      taiex: {
        index: parseFloat(latestData.TAIEX.replace(/,/g, '')),
        change: parseFloat(latestData.Change.replace(/,/g, ''))
      }
    };
    
    // 計算漲跌百分比
    if (result.taiex.index && result.taiex.change) {
      const prevIndex = result.taiex.index - result.taiex.change;
      result.taiex.changePercent = (result.taiex.change / prevIndex) * 100;
    }
    
    logger.info(`成功處理每日市場資訊，日期: ${result.date}, 加權指數: ${result.taiex.index}`);
    return result;
  } catch (error) {
    logger.error('處理每日市場資訊時發生錯誤:', error);
    return null;
  }
}

/**
 * 處理官方網站每日市場資訊資料
 * 將原始資料轉換為更易使用的格式
 * 
 * @param {Object} responseData 官方網站 API 回應資料
 * @returns {Object|null} 處理後的資料，如果轉換失敗則返回 null
 */
function processOfficialDailyMarketInfo(responseData) {
  if (!responseData || !responseData.data || !Array.isArray(responseData.data) || responseData.data.length === 0) {
    logger.error('處理官方網站每日市場資訊時收到無效資料');
    return null;
  }
  
  try {
    // 記錄標題與欄位名稱，便於調試
    logger.debug(`官方網站 API 標題: ${responseData.title}`);
    logger.debug(`官方網站 API 欄位: ${responseData.fields.join(', ')}`);
    
    // 記錄所有日期用於診斷
    const allDates = responseData.data.map(item => item[0]);
    logger.info(`官方網站 API 返回的所有日期: ${allDates.join(', ')}`);
    
    // 官方網站 API 返回的資料已經按日期排序（舊到新），最後一筆應該是最新的
    const latestDataRow = responseData.data[responseData.data.length - 1];
    
    // 資料欄位順序為: 日期, 成交股數, 成交金額, 成交筆數, 發行量加權股價指數, 漲跌點數
    // 這是根據 responseData.fields 提供的欄位順序
    const rocDate = latestDataRow[0]; // 中華民國年份格式 (114/04/14)
    const tradeVolume = latestDataRow[1]; // 成交股數
    const tradeValue = latestDataRow[2]; // 成交金額
    const transaction = latestDataRow[3]; // 成交筆數
    const taiexIndex = latestDataRow[4]; // 發行量加權股價指數
    const taiexChange = latestDataRow[5]; // 漲跌點數
    
    // 標準化日期格式
    const standardizedDate = standardizeDate(rocDate);
    logger.info(`找到最新日期資料: ${rocDate} (標準化為: ${standardizedDate})`);
    
    // 轉換為數字型別並移除千分位符號
    const result = {
      date: standardizedDate,
      market: {
        tradeVolume: parseFloat(tradeVolume.replace(/,/g, '')) / 100000000, // 轉為億股
        tradeValue: parseFloat(tradeValue.replace(/,/g, '')) / 100000000, // 轉為億元
        transaction: parseFloat(transaction.replace(/,/g, '')) / 1000 // 轉為千筆
      },
      taiex: {
        index: parseFloat(taiexIndex.replace(/,/g, '')),
        change: parseFloat(taiexChange.replace(/,/g, ''))
      }
    };
    
    // 計算漲跌百分比
    if (result.taiex.index && result.taiex.change) {
      const prevIndex = result.taiex.index - result.taiex.change;
      result.taiex.changePercent = (result.taiex.change / prevIndex) * 100;
    }
    
    logger.info(`成功處理官方網站每日市場資訊，日期: ${result.date}, 加權指數: ${result.taiex.index}`);
    return result;
  } catch (error) {
    logger.error('處理官方網站每日市場資訊時發生錯誤:', error);
    return null;
  }
}

// 導出函數
module.exports = {
  getHolidaySchedule,
  getDailyMarketInfo,
  getOfficialDailyMarketInfo,
  checkDataUpdated,
  processDailyMarketInfo,
  processOfficialDailyMarketInfo,
  standardizeDate,
  fetchOldAPI,
  fetchOfficialAPI
};
