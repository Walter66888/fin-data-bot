/**
 * 證交所 API 模組
 * 負責從台灣證券交易所開放 API 獲取資料
 */

const axios = require('axios');
const logger = require('../utils/logger');
const { format, parse, isValid } = require('date-fns');

// API 基礎 URL
const BASE_URL = 'https://openapi.twse.com.tw/v1';

// 標準請求頭
const headers = {
  'accept': 'application/json',
  'If-Modified-Since': 'Mon, 26 Jul 1997 05:00:00 GMT',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache'
};

// API 請求函數
async function fetchAPI(endpoint) {
  try {
    const url = `${BASE_URL}/${endpoint}`;
    logger.debug(`正在請求 API: ${url}`);
    
    const response = await axios.get(url, { headers });
    
    // 檢查回應狀態
    if (response.status !== 200) {
      logger.error(`API 請求失敗: ${url}, 狀態碼: ${response.status}`);
      return null;
    }
    
    // 記錄 Last-Modified 時間
    const lastModified = response.headers['last-modified'];
    if (lastModified) {
      logger.debug(`API ${endpoint} 資料更新時間: ${lastModified}`);
    }
    
    return {
      data: response.data,
      lastModified,
      headers: response.headers
    };
  } catch (error) {
    logger.error(`調用 API ${endpoint} 時發生錯誤:`, error);
    return null;
  }
}

/**
 * 獲取休市日期資料
 * @returns {Promise<Array|null>} 休市日期資料，如果請求失敗則返回 null
 */
async function getHolidaySchedule() {
  const result = await fetchAPI('holidaySchedule/holidaySchedule');
  return result ? result.data : null;
}

/**
 * 獲取集中市場每日成交資訊
 * @returns {Promise<Array|null>} 市場成交資訊，如果請求失敗則返回 null
 */
async function getDailyMarketInfo() {
  const result = await fetchAPI('exchangeReport/FMTQIK');
  return result ? result.data : null;
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
    const url = `${BASE_URL}/${endpoint}`;
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
 * 處理每日市場資訊資料
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
    // 通常取最新的一筆資料（第一筆）
    const latestData = data[0];
    
    // 標準化日期格式
    const dateStr = standardizeDate(latestData.Date);
    
    // 轉換為數字型別並移除千分位符號
    const result = {
      date: dateStr,
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

// 導出函數
module.exports = {
  getHolidaySchedule,
  getDailyMarketInfo,
  checkDataUpdated,
  processDailyMarketInfo,
  standardizeDate,
  fetchAPI
};
