/**
 * 期交所爬蟲資料導入 MongoDB 腳本
 * 讀取 Python 爬蟲生成的 JSON 資料並導入資料庫
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { format } = require('date-fns');
const logger = require('./src/utils/logger');

// 連接 MongoDB
async function connectDB() {
  try {
    const MONGODB_URI = process.env.MONGODB_URI;
    if (!MONGODB_URI) {
      logger.error('MongoDB 連接字串未設定，請在環境變數中定義 MONGODB_URI');
      process.exit(1);
    }

    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    logger.info('已成功連接到 MongoDB');
    return mongoose.connection;
  } catch (error) {
    logger.error('連接 MongoDB 時發生錯誤:', error);
    throw error;
  }
}

// 載入 FuturesMarketData 模型
const FuturesMarketData = require('./src/db/models/FuturesMarketData');

/**
 * 標準化日期格式（將可能的各種格式轉換為YYYY-MM-DD）
 * 
 * @param {string} dateStr 原始日期字串
 * @returns {string} 標準化的日期字串 (YYYY-MM-DD)
 */
function standardizeDate(dateStr) {
  if (!dateStr) return '';
  
  // 處理斜線分隔的日期格式（如：2023/04/15）
  if (dateStr.includes('/')) {
    try {
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        const year = parts[0];
        const month = parts[1].padStart(2, '0');
        const day = parts[2].padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
    } catch (e) {
      logger.warn(`無法解析日期格式(斜線分隔): ${dateStr}`, e);
    }
  }
  
  // 如果所有嘗試都失敗，記錄警告並返回原始字串
  logger.warn(`無法標準化日期格式: ${dateStr}`);
  return dateStr;
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

/**
 * 更新期貨市場資料到資料庫
 * 
 * @param {Object} processedData 處理後的資料
 * @param {Object} rawDataObj 包含各 API 原始資料的物件
 */
async function updateFuturesMarketData(processedData, rawDataObj) {
  try {
    if (!processedData || !processedData.date) {
      logger.error('期貨市場資料缺少日期');
      return;
    }
    
    // 檢查資料庫中是否已存在此日期的資料
    let futuresData = await FuturesMarketData.findOne({ date: processedData.date });
    
    if (futuresData) {
      // 更新現有資料
      
      // 更新 PCR 比率資料
      if (processedData.pcRatio) {
        futuresData.putCallRatio = {
          putVolume: processedData.pcRatio.putVolume,
          callVolume: processedData.pcRatio.callVolume,
          volumeRatio: processedData.pcRatio.volumeRatio,
          putOI: processedData.pcRatio.putOI,
          callOI: processedData.pcRatio.callOI,
          oiRatio: processedData.pcRatio.oiRatio
        };
      }
      
      // 更新資料來源狀態
      if (!futuresData.dataSources) futuresData.dataSources = {};
      
      if (rawDataObj.putCallRatio) {
        futuresData.dataSources.putCallRatio = {
          updated: true,
          updateTime: new Date()
        };
        
        if (!futuresData.rawData) futuresData.rawData = {};
        futuresData.rawData.putCallRatio = rawDataObj.putCallRatio;
      }
      
      futuresData.lastUpdated = new Date();
      
      await futuresData.save();
      logger.info(`已更新既有期貨市場資料: ${processedData.date}`);
    } else {
      // 創建新資料
      const newFuturesData = {
        date: processedData.date,
        dataTimestamp: new Date(),
        lastUpdated: new Date(),
        dataSources: {},
        rawData: {}
      };
      
      // 設置 PCR 比率資料
      if (processedData.pcRatio) {
        newFuturesData.putCallRatio = {
          putVolume: processedData.pcRatio.putVolume,
          callVolume: processedData.pcRatio.callVolume,
          volumeRatio: processedData.pcRatio.volumeRatio,
          putOI: processedData.pcRatio.putOI,
          callOI: processedData.pcRatio.callOI,
          oiRatio: processedData.pcRatio.oiRatio
        };
      }
      
      // 設置資料來源狀態
      if (rawDataObj.putCallRatio) {
        newFuturesData.dataSources.putCallRatio = {
          updated: true,
          updateTime: new Date()
        };
        newFuturesData.rawData.putCallRatio = rawDataObj.putCallRatio;
      }
      
      futuresData = new FuturesMarketData(newFuturesData);
      await futuresData.save();
      logger.info(`已創建新期貨市場資料: ${processedData.date}`);
    }
  } catch (error) {
    logger.error('更新期貨市場資料時發生錯誤:', error);
    throw error;
  }
}

/**
 * 主要導入函數
 * 
 * @param {string} filePath JSON 檔案路徑
 */
async function importData(filePath) {
  try {
    logger.info(`開始從 ${filePath} 導入數據...`);
    
    // 讀取 JSON 檔案
    const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    if (!jsonData || !Array.isArray(jsonData) || jsonData.length === 0) {
      logger.error('JSON 資料無效或為空');
      return false;
    }
    
    // 處理 PC Ratio 資料
    const processedData = processPutCallRatio(jsonData);
    
    if (processedData) {
      // 更新資料到資料庫
      await updateFuturesMarketData(processedData, {
        putCallRatio: jsonData
      });
      
      logger.info(`成功導入 ${processedData.date} 的 PC Ratio 資料`);
      return true;
    } else {
      logger.error('處理 PC Ratio 資料失敗');
      return false;
    }
  } catch (error) {
    logger.error('導入數據時發生錯誤:', error);
    return false;
  }
}

/**
 * 檢查並導入資料
 * 檢查資料庫是否為空或資料過期，決定是否需要執行爬蟲
 */
async function checkAndImportData() {
  try {
    // 檢查資料庫中是否有期貨市場資料
    const count = await FuturesMarketData.countDocuments();
    
    // 如果數據庫為空，需要首次抓取
    if (count === 0) {
      logger.info('資料庫中沒有期貨市場資料，需要執行爬蟲');
      
      // 如果沒有 JSON 檔案，需要先執行爬蟲
      const filePath = path.join(__dirname, 'data', 'pc_ratio_latest.json');
      if (!fs.existsSync(filePath)) {
        logger.info('找不到 JSON 檔案，請先執行爬蟲腳本');
        process.exit(1);
      }
      
      // 導入資料
      return await importData(filePath);
    } else {
      // 獲取最新的一筆資料
      const latestData = await FuturesMarketData.findOne().sort({ date: -1 }).limit(1);
      
      // 檢查最新資料日期是否為今天
      const today = format(new Date(), 'yyyy-MM-dd');
      
      if (latestData.date === today) {
        logger.info(`今日 (${today}) 的資料已存在，不需要更新`);
        return true;
      } else {
        logger.info(`最新資料日期 (${latestData.date}) 不是今天 (${today})，檢查爬蟲結果並更新`);
        
        // 檢查 JSON 檔案
        const filePath = path.join(__dirname, 'data', 'pc_ratio_latest.json');
        if (!fs.existsSync(filePath)) {
          logger.info('找不到 JSON 檔案，請先執行爬蟲腳本');
          return false;
        }
        
        // 讀取 JSON 檔案，檢查日期
        const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (jsonData && jsonData.length > 0) {
          const jsonDate = standardizeDate(jsonData[0].Date);
          
          // 如果 JSON 資料日期比資料庫日期新，則更新資料庫
          if (jsonDate > latestData.date) {
            logger.info(`JSON 檔案日期 (${jsonDate}) 比資料庫最新日期新，進行更新`);
            return await importData(filePath);
          } else {
            logger.info(`JSON 檔案日期 (${jsonDate}) 不比資料庫最新日期新，不需更新`);
            return true;
          }
        } else {
          logger.error('JSON 資料無效或為空');
          return false;
        }
      }
    }
  } catch (error) {
    logger.error('檢查並導入資料時發生錯誤:', error);
    return false;
  }
}

/**
 * 程式入口
 */
async function main() {
  try {
    // 連接資料庫
    await connectDB();
    
    // 檢查並導入資料
    const success = await checkAndImportData();
    
    if (success) {
      logger.info('資料檢查與導入流程成功完成');
    } else {
      logger.error('資料檢查與導入流程失敗');
    }
    
    // 關閉資料庫連接
    await mongoose.disconnect();
    logger.info('已斷開與 MongoDB 的連接');
    
    process.exit(success ? 0 : 1);
  } catch (error) {
    logger.error('執行主程序時發生錯誤:', error);
    process.exit(1);
  }
}

// 執行主程序
main();
