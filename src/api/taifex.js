/**
 * 期交所 API 模組
 * 負責從台灣期貨交易所開放 API 獲取資料
 */

const axios = require('axios');
const logger = require('../utils/logger');

// API 基礎 URL
const BASE_URL = 'https://openapi.taifex.com.tw/v1';

// API 請求函數
async function fetchAPI(endpoint) {
  try {
    // 生成時間戳參數，確保每次請求都獲取最新資料而非快取
    const timestamp = new Date().getTime();
    const url = `${BASE_URL}/${endpoint}?_=${timestamp}`;
    logger.debug(`正在請求期交所 API: ${url}`);
    
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
      logger.error(`期交所 API 請求失敗: ${url}, 狀態碼: ${response.status}`);
      return null;
    }
    
    // 記錄 Last-Modified 時間
    const lastModified = response.headers['last-modified'];
    if (lastModified) {
      logger.debug(`期交所 API ${endpoint} 資料更新時間: ${lastModified}`);
    }
    
    // 記錄返回的數據條數，增加診斷資訊
    if (response.data && Array.isArray(response.data)) {
      logger.debug(`期交所 API ${endpoint} 返回 ${response.data.length} 條數據`);
      // 記錄第一條數據的日期，用於檢查是否為最新
      if (response.data.length > 0 && response.data[0].Date) {
        logger.info(`期交所 API ${endpoint} 返回的最新日期: ${response.data[0].Date}`);
      }
    }
    
    return {
      data: response.data,
      lastModified,
      headers: response.headers
    };
  } catch (error) {
    logger.error(`調用期交所 API ${endpoint} 時發生錯誤:`, error);
    return null;
  }
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
    const url = `${BASE_URL}/${endpoint}?_=${timestamp}`;
    
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
      logger.warn(`期交所 API ${endpoint} 沒有提供 Last-Modified 頭`);
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
      logger.info(`期交所 API ${endpoint} 已於今天 ${lastModifiedDate.toTimeString()} 更新`);
      return true;
    } else {
      logger.info(`期交所 API ${endpoint} 最後更新於 ${lastModifiedDate.toISOString()}，尚未更新今日資料`);
      return false;
    }
  } catch (error) {
    logger.error(`檢查期交所 API ${endpoint} 資料更新時發生錯誤:`, error);
    return false;
  }
}

/**
 * 獲取期貨大額交易人未沖銷部位資料
 * @returns {Promise<Array|null>} 大額交易人未沖銷部位資料，如果請求失敗則返回 null
 */
async function getLargeTradersFutures() {
  const result = await fetchAPI('OpenInterestOfLargeTradersFutures');
  return result ? result.data : null;
}

/**
 * 獲取選擇權大額交易人未沖銷部位資料
 * @returns {Promise<Array|null>} 大額交易人未沖銷部位資料，如果請求失敗則返回 null
 */
async function getLargeTradersOptions() {
  const result = await fetchAPI('OpenInterestOfLargeTradersOptions');
  return result ? result.data : null;
}

/**
 * 獲取臺指選擇權 Put/Call 比率
 * @returns {Promise<Array|null>} Put/Call 比率資料，如果請求失敗則返回 null
 */
async function getPutCallRatio() {
  const result = await fetchAPI('PutCallRatio');
  return result ? result.data : null;
}

/**
 * 標準化日期格式（將可能的各種格式轉換為YYYY-MM-DD）
 * 
 * @param {string} dateStr 原始日期字串
 * @returns {string} 標準化的日期字串 (YYYY-MM-DD)
 */
function standardizeDate(dateStr) {
  if (!dateStr) return '';
  
  // 移除可能的非數字字符（例如斜線）
  dateStr = dateStr.replace(/\D/g, '');
  
  // 檢查是否為中華民國年份格式（例如 1140401）
  if (dateStr.length === 7) {
    const rocYear = parseInt(dateStr.substring(0, 3), 10);
    const month = dateStr.substring(3, 5);
    const day = dateStr.substring(5, 7);
    const westernYear = rocYear + 1911;
    return `${westernYear}-${month}-${day}`;
  }
  
  // 檢查是否為西元年份格式（例如 20250401）
  if (dateStr.length === 8) {
    const year = dateStr.substring(0, 4);
    const month = dateStr.substring(4, 6);
    const day = dateStr.substring(6, 8);
    return `${year}-${month}-${day}`;
  }
  
  // 原始格式可能已經是 YYYY-MM-DD
  if (dateStr.includes('-') && dateStr.length === 10) {
    return dateStr;
  }
  
  // 如果無法識別，返回原始字串
  return dateStr;
}

/**
 * 處理大額交易人期貨資料
 * 將原始資料轉換為更易使用的格式
 * 
 * @param {Array} data 原始 API 資料
 * @returns {Object|null} 處理後的資料，如果轉換失敗則返回 null
 */
function processLargeTradersFutures(data) {
  if (!data || !Array.isArray(data) || data.length === 0) {
    logger.error('處理大額交易人期貨資料時收到無效資料');
    return null;
  }
  
  try {
    // 過濾台指期近月的資料
    const txfData = data.filter(item => 
      item.ContractName === '臺股期貨' && 
      item.TypeOfTraders === '全部交易人'
    );
    
    if (txfData.length === 0) {
      logger.error('找不到台指期近月資料');
      return null;
    }
    
    // 尋找最新日期的資料
    let latestDate = '';
    for (const item of txfData) {
      if (item.Date > latestDate) {
        latestDate = item.Date;
      }
    }
    
    // 標準化日期格式
    latestDate = standardizeDate(latestDate);
    
    // 過濾出最新日期的台指期近月資料
    const latestTxfData = txfData.filter(item => standardizeDate(item.Date) === latestDate);
    
    // 處理不同交易人類別的資料
    const result = {
      date: latestDate,
      txf: {}
    };
    
    // 計算十大交易人淨部位
    for (const item of latestTxfData) {
      if (item.TypeOfTraders === '全部交易人') {
        const top10Buy = parseInt(item.Top10Buy.replace(/,/g, ''), 10) || 0;
        const top10Sell = parseInt(item.Top10Sell.replace(/,/g, ''), 10) || 0;
        result.txf.top10NetOI = top10Buy - top10Sell;
        result.txf.marketOI = parseInt(item.OIOfMarket.replace(/,/g, ''), 10) || 0;
      }
    }
    
    return result;
  } catch (error) {
    logger.error('處理大額交易人期貨資料時發生錯誤:', error);
    return null;
  }
}

/**
 * 處理 PCR 比率資料
 * 將原始資料轉換為更易使用的格式
 * 
 * @param {Array} data 原始 API 資料
 * @returns {Object|null} 處理後的資料，如果轉換失敗則返回 null
 */
function processPutCallRatio(data) {
  if (!data || !Array.isArray(data) || data.length === 0) {
    logger.error('處理 PCR 比率資料時收到無效資料');
    return null;
  }
  
  try {
    // 通常取最新的一筆資料（第一筆）
    const latestData = data[0];
    
    // 標準化日期格式
    const standardizedDate = standardizeDate(latestData.Date);
    
    // 轉換為數字型別
    const result = {
      date: standardizedDate,
      pcRatio: {
        putVolume: parseInt(latestData.PutVolume.replace(/,/g, ''), 10) || 0,
        callVolume: parseInt(latestData.CallVolume.replace(/,/g, ''), 10) || 0,
        volumeRatio: parseFloat(latestData['PutCallVolumeRatio%'].replace(/,/g, '')) || 0,
        putOI: parseInt(latestData.PutOI.replace(/,/g, ''), 10) || 0,
        callOI: parseInt(latestData.CallOI.replace(/,/g, ''), 10) || 0,
        oiRatio: parseFloat(latestData['PutCallOIRatio%'].replace(/,/g, '')) || 0
      }
    };
    
    return result;
  } catch (error) {
    logger.error('處理 PCR 比率資料時發生錯誤:', error);
    return null;
  }
}

// 導出函數
module.exports = {
  getLargeTradersFutures,
  getLargeTradersOptions,
  getPutCallRatio,
  checkDataUpdated,
  processLargeTradersFutures,
  processPutCallRatio,
  standardizeDate
};
