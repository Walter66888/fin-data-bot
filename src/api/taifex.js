/**
 * 期交所 API 模組
 * 負責從台灣期貨交易所開放 API 獲取資料
 */

const axios = require('axios');
const logger = require('../utils/logger');

// API 基礎 URL
const BASE_URL = 'https://openapi.taifex.com.tw/v1';

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
    logger.debug(`正在請求期交所 API: ${url}`);
    
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
    const url = `${BASE_URL}/${endpoint}`;
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
    
    // 過濾出最新日期的台指期近月資料
    const latestTxfData = txfData.filter(item => item.Date === latestDate);
    
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
    
    // 轉換為數字型別
    const result = {
      date: latestData.Date,
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
  processPutCallRatio
};
