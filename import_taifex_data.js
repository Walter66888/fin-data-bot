/**
 * 期交所爬蟲資料導入 MongoDB 腳本
 * 讀取 Python 爬蟲生成的 JSON 資料並導入資料庫
 * 支援多種期交所資料，包括 PC Ratio 和三大法人期貨淨部位
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { format } = require('date-fns');
const logger = require('./src/utils/logger');

// 解析命令行參數
const args = process.argv.slice(2);
let dataType = 'pcRatio'; // 默認處理 PC Ratio 資料
let specificFile = null; // 指定的文件路徑

// 查找 --type 參數和 --file 參數
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--type' || args[i] === '-t') {
    if (i + 1 < args.length) {
      dataType = args[i + 1];
    }
  } else if (args[i].startsWith('--type=')) {
    dataType = args[i].split('=')[1];
  } else if (args[i] === '--file' || args[i] === '-f') {
    if (i + 1 < args.length) {
      specificFile = args[i + 1];
    }
  } else if (args[i].startsWith('--file=')) {
    specificFile = args[i].split('=')[1];
  }
}

logger.info(`準備處理資料類型: ${dataType}${specificFile ? `, 指定文件: ${specificFile}` : ''}`);

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
 * 參考自 taifex.js 中的 standardizeDate 方法
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
  
  // 處理中華民國年份格式（如：112/04/15）
  const rocPattern = /^(\d{2,3})\/(\d{1,2})\/(\d{1,2})$/;
  const rocMatch = dateStr.match(rocPattern);
  if (rocMatch) {
    const rocYear = parseInt(rocMatch[1], 10);
    if (rocYear < 200) { // 判斷是否為民國年
      const westernYear = rocYear + 1911;
      const month = rocMatch[2].padStart(2, '0');
      const day = rocMatch[3].padStart(2, '0');
      return `${westernYear}-${month}-${day}`;
    }
  }
  
  // 處理純數字日期格式（如：1140415）
  const numericPattern = /^(\d{3})(\d{2})(\d{2})$/;
  const numericMatch = dateStr.match(numericPattern);
  if (numericMatch) {
    const rocYear = parseInt(numericMatch[1], 10);
    const westernYear = rocYear + 1911;
    const month = numericMatch[2];
    const day = numericMatch[3];
    return `${westernYear}-${month}-${day}`;
  }
  
  // 處理西元年純數字日期格式（如：20230415）
  const westernPattern = /^(\d{4})(\d{2})(\d{2})$/;
  const westernMatch = dateStr.match(westernPattern);
  if (westernMatch) {
    const year = westernMatch[1];
    const month = westernMatch[2];
    const day = westernMatch[3];
    return `${year}-${month}-${day}`;
  }
  
  // 如果所有嘗試都失敗，記錄警告並返回原始字串
  logger.warn(`無法標準化日期格式: ${dateStr}`);
  return dateStr;
}

/**
 * 處理 PCR 比率資料
 * 將原始資料轉換為更易使用的格式
 * 參考自 taifexScraper.fetchTxoPutCallRatio 方法的結果格式
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
    
    // 輸出最新資料的摘要，方便在日誌中查看
    logger.info(`處理資料日期: ${latestData.Date}`);
    logger.info(`買權成交量: ${latestData.CallVolume}, 賣權成交量: ${latestData.PutVolume}`);
    logger.info(`成交量比率: ${latestData['PutCallVolumeRatio%']}`);
    logger.info(`買權未平倉量: ${latestData.CallOI}, 賣權未平倉量: ${latestData.PutOI}`);
    logger.info(`未平倉量比率: ${latestData['PutCallOIRatio%']}`);
    
    // 標準化日期格式
    const standardizedDate = standardizeDate(latestData.Date);
    logger.info(`標準化後的日期: ${standardizedDate}`);
    
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
 * 處理三大法人期貨淨部位資料
 * 將原始資料轉換為更易使用的格式
 * 參考自 taifexScraper.fetchFuturesInstitutional 方法的結果格式
 * 
 * @param {Array} data 原始 API 資料
 * @returns {Object|null} 處理後的資料，如果轉換失敗則返回 null
 */
function processInstitutionalData(data) {
  if (!data || !Array.isArray(data) || data.length === 0) {
    logger.error('處理三大法人期貨淨部位資料時收到無效資料');
    return null;
  }
  
  try {
    // 找出最新日期
    let latestDate = '';
    for (const item of data) {
      if (item.Date && item.Date > latestDate) {
        latestDate = item.Date;
      }
    }
    
    // 篩選最新日期的資料
    const latestData = data.filter(item => item.Date === latestDate);
    
    if (latestData.length === 0) {
      logger.error('無法找到最新日期的資料');
      return null;
    }
    
    // 標準化日期格式
    const standardizedDate = standardizeDate(latestDate);
    logger.info(`標準化後的日期: ${standardizedDate}`);
    
    // 初始化結果物件，模仿 taifexScraper.fetchFuturesInstitutional 的返回格式
    const result = {
      date: standardizedDate,
      institutionalInvestors: {
        foreign: {},
        investment: {},
        dealer: {}
      }
    };
    
    // 處理各類投資人資料
    for (const item of latestData) {
      if (!item.InvestorType) continue;
      
      // 根據投資人類型分類處理
      switch (item.InvestorType) {
        case '外資及陸資':
          // 轉換為數值並處理千分位逗號
          const netTradeValue = parseFloat(String(item.NetTradeValue).replace(/,/g, '')) || 0;
          const netOIVolume = parseInt(String(item.NetOIVolume).replace(/,/g, '')) || 0;
          
          result.institutionalInvestors.foreign = {
            netBuySell: netTradeValue / 100000 || 0, // 轉換為億元
            netOI: netOIVolume
          };
          
          // 如果是台指期，記錄額外資訊
          if (item.ContractName === '臺股期貨') {
            result.institutionalInvestors.foreign.txfOI = netOIVolume;
            
            // 若有 NetTradeVolume，也記錄為 txfChange
            const netTradeVolume = parseInt(String(item.NetTradeVolume).replace(/,/g, '')) || 0;
            result.institutionalInvestors.foreign.txfChange = netTradeVolume;
          }
          break;
          
        case '投信':
          const investmentNetTradeValue = parseFloat(String(item.NetTradeValue).replace(/,/g, '')) || 0;
          result.institutionalInvestors.investment = {
            netBuySell: investmentNetTradeValue / 100000 || 0 // 轉換為億元
          };
          break;
          
        case '自營商':
          const dealerNetTradeValue = parseFloat(String(item.NetTradeValue).replace(/,/g, '')) || 0;
          result.institutionalInvestors.dealer.netBuySellTotal = dealerNetTradeValue / 100000 || 0; // 轉換為億元
          break;
          
        case '自營商(自行買賣)':
          const selfNetTradeValue = parseFloat(String(item.NetTradeValue).replace(/,/g, '')) || 0;
          result.institutionalInvestors.dealer.netBuySellSelf = selfNetTradeValue / 100000 || 0; // 轉換為億元
          break;
          
        case '自營商(避險)':
          const hedgeNetTradeValue = parseFloat(String(item.NetTradeValue).replace(/,/g, '')) || 0;
          result.institutionalInvestors.dealer.netBuySellHedge = hedgeNetTradeValue / 100000 || 0; // 轉換為億元
          break;
      }
    }
    
    // 計算三大法人合計買賣超
    result.institutionalInvestors.totalNetBuySell = 
      (result.institutionalInvestors.foreign.netBuySell || 0) +
      (result.institutionalInvestors.investment.netBuySell || 0) +
      (result.institutionalInvestors.dealer.netBuySellTotal || 0);
    
    // 檢查資料完整性
    if (Object.keys(result.institutionalInvestors.foreign).length === 0 && 
        Object.keys(result.institutionalInvestors.investment).length === 0 &&
        Object.keys(result.institutionalInvestors.dealer).length === 0) {
      logger.warn('三大法人資料可能不完整，請檢查原始資料');
    } else {
      // 輸出資料摘要
      logger.info(`處理資料日期: ${standardizedDate}`);
      logger.info(`三大法人合計買賣超: ${result.institutionalInvestors.totalNetBuySell.toFixed(2)} 億元`);
      if (result.institutionalInvestors.foreign.netBuySell !== undefined) {
        logger.info(`外資買賣超: ${result.institutionalInvestors.foreign.netBuySell.toFixed(2)} 億元`);
      }
      if (result.institutionalInvestors.investment.netBuySell !== undefined) {
        logger.info(`投信買賣超: ${result.institutionalInvestors.investment.netBuySell.toFixed(2)} 億元`);
      }
      if (result.institutionalInvestors.dealer.netBuySellTotal !== undefined) {
        logger.info(`自營商買賣超: ${result.institutionalInvestors.dealer.netBuySellTotal.toFixed(2)} 億元`);
      }
    }
    
    return result;
  } catch (error) {
    logger.error('處理三大法人期貨淨部位資料時發生錯誤:', error);
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
      logger.info(`找到既有資料記錄 (日期: ${processedData.date})，進行更新`);
      
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
        
        logger.info('已更新 PCR 比率資料');
      }
      
      // 更新三大法人資料
      if (processedData.institutionalInvestors) {
        futuresData.institutionalInvestors = processedData.institutionalInvestors;
        
        logger.info('已更新三大法人資料');
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
      
      if (rawDataObj.institutional) {
        futuresData.dataSources.institutional = {
          updated: true,
          updateTime: new Date()
        };
        
        if (!futuresData.rawData) futuresData.rawData = {};
        futuresData.rawData.institutional = rawDataObj.institutional;
      }
      
      futuresData.lastUpdated = new Date();
      
      await futuresData.save();
      logger.info(`已更新既有期貨市場資料: ${processedData.date}`);
    } else {
      // 創建新資料
      logger.info(`未找到既有資料記錄，創建新記錄 (日期: ${processedData.date})`);
      
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
      
      // 設置三大法人資料
      if (processedData.institutionalInvestors) {
        newFuturesData.institutionalInvestors = processedData.institutionalInvestors;
      }
      
      // 設置資料來源狀態
      if (rawDataObj.putCallRatio) {
        newFuturesData.dataSources.putCallRatio = {
          updated: true,
          updateTime: new Date()
        };
        newFuturesData.rawData.putCallRatio = rawDataObj.putCallRatio;
      }
      
      if (rawDataObj.institutional) {
        newFuturesData.dataSources.institutional = {
          updated: true,
          updateTime: new Date()
        };
        newFuturesData.rawData.institutional = rawDataObj.institutional;
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
 * 導入 PC Ratio 資料
 * 
 * @param {string} filePath JSON 檔案路徑
 */
async function importPCRatioData(filePath) {
  try {
    logger.info(`開始從 ${filePath} 導入 PC Ratio 數據...`);
    
    // 讀取 JSON 檔案
    const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    if (!jsonData || !Array.isArray(jsonData) || jsonData.length === 0) {
      logger.error('JSON 資料無效或為空');
      return false;
    }
    
    // 輸出 JSON 資料的基本資訊
    logger.info(`JSON 資料包含 ${jsonData.length} 筆記錄`);
    
    // 處理 PC Ratio 資料
    const processedData = processPutCallRatio(jsonData);
    
    if (processedData) {
      // 更新資料到資料庫
      await updateFuturesMarketData(processedData, {
        putCallRatio: jsonData
      });
      
      logger.info(`成功導入 ${processedData.date} 的 PC Ratio 資料`);
      
      // 輸出導入後的摘要
      const latestFuturesData = await FuturesMarketData.findOne({ 
        date: processedData.date 
      });
      
      if (latestFuturesData) {
        logger.info('MongoDB 中的資料摘要:');
        logger.info(`日期: ${latestFuturesData.date}`);
        logger.info(`未平倉量比率: ${latestFuturesData.putCallRatio.oiRatio}`);
        logger.info(`成交量比率: ${latestFuturesData.putCallRatio.volumeRatio}`);
        logger.info(`最後更新時間: ${latestFuturesData.lastUpdated}`);
      }
      
      return true;
    } else {
      logger.error('處理 PC Ratio 資料失敗');
      return false;
    }
  } catch (error) {
    logger.error('導入 PC Ratio 數據時發生錯誤:', error);
    return false;
  }
}

/**
 * 導入三大法人期貨淨部位資料
 * 
 * @param {string} filePath JSON 檔案路徑
 */
async function importInstitutionalData(filePath) {
  try {
    logger.info(`開始從 ${filePath} 導入三大法人期貨淨部位數據...`);
    
    // 讀取 JSON 檔案
    const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    if (!jsonData || !Array.isArray(jsonData) || jsonData.length === 0) {
      logger.error('JSON 資料無效或為空');
      return false;
    }
    
    // 輸出 JSON 資料的基本資訊
    logger.info(`JSON 資料包含 ${jsonData.length} 筆記錄`);
    
    // 處理三大法人期貨淨部位資料
    const processedData = processInstitutionalData(jsonData);
    
    if (processedData) {
      // 更新資料到資料庫
      await updateFuturesMarketData(processedData, {
        institutional: jsonData
      });
      
      logger.info(`成功導入 ${processedData.date} 的三大法人期貨淨部位資料`);
      
      // 輸出導入後的摘要
      const latestFuturesData = await FuturesMarketData.findOne({ 
        date: processedData.date 
      });
      
      if (latestFuturesData && latestFuturesData.institutionalInvestors) {
        logger.info('MongoDB 中的資料摘要:');
        logger.info(`日期: ${latestFuturesData.date}`);
        
        const investors = latestFuturesData.institutionalInvestors;
        if (investors.totalNetBuySell !== undefined) {
          logger.info(`三大法人合計買賣超: ${investors.totalNetBuySell.toFixed(2)} 億元`);
        }
        
        if (investors.foreign && investors.foreign.netBuySell !== undefined) {
          logger.info(`外資買賣超: ${investors.foreign.netBuySell.toFixed(2)} 億元`);
        }
        
        logger.info(`最後更新時間: ${latestFuturesData.lastUpdated}`);
      }
      
      return true;
    } else {
      logger.error('處理三大法人期貨淨部位資料失敗');
      return false;
    }
  } catch (error) {
    logger.error('導入三大法人期貨淨部位數據時發生錯誤:', error);
    return false;
  }
}

/**
 * 檢查並導入資料
 * 根據指定的資料類型，從對應的 JSON 文件導入資料到 MongoDB
 */
async function checkAndImportData() {
  try {
    let success = false;
    
    // 根據資料類型處理不同的資料
    switch (dataType) {
      case 'pcRatio':
        // 處理 PC Ratio 資料
        const pcRatioFilePath = specificFile || path.join(__dirname, 'data', 'pc_ratio_latest.json');
        if (!fs.existsSync(pcRatioFilePath)) {
          logger.error(`找不到爬蟲資料文件: ${pcRatioFilePath}`);
          return false;
        }
        success = await importPCRatioData(pcRatioFilePath);
        break;
        
      case 'institutional':
        // 處理三大法人期貨淨部位資料
        const institutionalFilePath = specificFile || path.join(__dirname, 'data', 'institutional_latest.json');
        if (!fs.existsSync(institutionalFilePath)) {
          logger.error(`找不到爬蟲資料文件: ${institutionalFilePath}`);
          return false;
        }
        success = await importInstitutionalData(institutionalFilePath);
        break;
        
      default:
        logger.error(`未知的資料類型: ${dataType}`);
        return false;
    }
    
    return success;
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
    // 輸出環境資訊
    logger.info(`執行環境: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`執行時間: ${new Date().toISOString()}`);
    logger.info(`處理資料類型: ${dataType}`);
    
    // 連接資料庫
    await connectDB();
    
    // 檢查並導入資料
    const success = await checkAndImportData();
    
    if (success) {
      logger.info(`${dataType} 資料導入成功完成`);
    } else {
      logger.error(`${dataType} 資料導入失敗`);
    }
    
    // 關閉資料庫連接
    await mongoose.disconnect();
    logger.info('已斷開與 MongoDB 的連接');
    
    // 添加一個明確的成功/失敗訊息，方便在 GitHub Actions 日誌中查看
    if (success) {
      console.log('=============================');
      console.log(`✅ ${dataType} 爬蟲資料已成功導入 MongoDB`);
      console.log('=============================');
    } else {
      console.log('=============================');
      console.log(`❌ ${dataType} 爬蟲資料導入 MongoDB 失敗`);
      console.log('=============================');
    }
    
    process.exit(success ? 0 : 1);
  } catch (error) {
    logger.error('執行主程序時發生錯誤:', error);
    process.exit(1);
  }
}

// 執行主程序
main();
