/**
 * 排程任務處理模組
 * 負責安排和執行定時任務，包含證交所和期交所資料抓取、更新檢查等
 */

const cron = require('node-cron');
const { format, addMinutes } = require('date-fns');
const twseAPI = require('../api/twse');
const taifexAPI = require('../api/taifex');
const MarketData = require('../db/models/MarketData');
const FuturesMarketData = require('../db/models/FuturesMarketData');
const Holiday = require('../db/models/Holiday');
const logger = require('../utils/logger');
const config = require('../config/config');

// Line Bot 訊息推送功能
const lineNotify = require('../linebot/notify');

// 存儲任務
let scheduledJobs = {};

/**
 * 初始化所有排程任務
 */
function initJobs() {
  logger.info('初始化排程任務...');
  
  // 載入休市日資料 (每週一早上更新)
  scheduledJobs.updateHolidays = cron.schedule('0 8 * * 1', updateHolidaySchedule, {
    scheduled: true,
    timezone: 'Asia/Taipei'
  });
  
  // 安排每日資料更新檢查 (隨機延遲 1-3 分鐘)
  scheduleMarketDataUpdate();
  
  // 每天早上檢查並清理過期資料 (超過一個月)
  scheduledJobs.cleanupData = cron.schedule('0 3 * * *', cleanupOldData, {
    scheduled: true,
    timezone: 'Asia/Taipei'
  });
  
  logger.info('所有排程任務已初始化');
}

/**
 * 安排每日市場資料更新任務
 * 設定在下午 3:00 後的隨機時間
 */
function scheduleMarketDataUpdate() {
  // 獲取當前日期
  const now = new Date();
  const today = format(now, 'yyyy-MM-dd');
  
  // 檢查今天是否為交易日
  Holiday.isHoliday(today)
    .then(isHoliday => {
      // 如果是休市日，則不排程資料更新任務
      if (isHoliday) {
        logger.info(`今日 ${today} 為休市日，不排程資料更新任務`);
        return;
      }
      
      // 如果是交易日，安排下午資料更新任務
      // 基準時間：下午 3:00
      const baseTime = new Date();
      baseTime.setHours(15, 0, 0, 0);
      
      // 如果現在已經超過下午 3:00，則立即執行
      let scheduleTime;
      if (now > baseTime) {
        // 生成隨機延遲（1-3 分鐘）
        const randomDelay = Math.floor(Math.random() * 3) + 1;
        scheduleTime = addMinutes(now, randomDelay);
        
        logger.info(`現在時間已超過下午 3:00，安排 ${randomDelay} 分鐘後執行資料更新檢查`);
      } else {
        // 生成隨機延遲（1-3 分鐘）
        const randomDelay = Math.floor(Math.random() * 3) + 1;
        scheduleTime = addMinutes(baseTime, randomDelay);
        
        logger.info(`安排在下午 ${format(scheduleTime, 'HH:mm:ss')} 執行資料更新檢查`);
      }
      
      // 取消之前的排程（如果存在）
      if (scheduledJobs.checkMarketData) {
        scheduledJobs.checkMarketData.stop();
      }
      
      // 轉換為 cron 表達式
      const hours = scheduleTime.getHours();
      const minutes = scheduleTime.getMinutes();
      const cronExpression = `${minutes} ${hours} * * *`;
      
      // 建立新的排程
      scheduledJobs.checkMarketData = cron.schedule(cronExpression, checkAndUpdateAllMarketData, {
        scheduled: true,
        timezone: 'Asia/Taipei'
      });
      
      logger.info(`已安排資料更新檢查任務: ${cronExpression}`);
    })
    .catch(error => {
      logger.error('檢查交易日時發生錯誤，默認設置更新任務:', error);
      
      // 發生錯誤時，仍然安排任務作為後備措施
      // 下午 3:00 執行
      const cronExpression = '0 15 * * *';
      scheduledJobs.checkMarketData = cron.schedule(cronExpression, checkAndUpdateAllMarketData, {
        scheduled: true,
        timezone: 'Asia/Taipei'
      });
    });
}

/**
 * 檢查並更新所有市場資料
 * 此函數會檢查證交所和期交所 API 資料是否已更新，如果已更新則保存到資料庫
 * 
 * @returns {Promise<boolean>} 如果任何資料成功更新返回 true，否則返回 false
 */
async function checkAndUpdateAllMarketData() {
  logger.info('開始檢查所有市場資料更新...');
  
  try {
    // 證交所資料更新
    const stockMarketUpdated = await checkAndUpdateMarketData();
    
    // 期交所資料更新
    const futuresMarketUpdated = await checkAndUpdateFuturesMarketData();
    
    // 如果任何一個更新成功，則發送通知
    if (stockMarketUpdated || futuresMarketUpdated) {
      // 嘗試整合證交所和期交所的資料，以發送完整的通知
      await integrateAndNotify();
      return true;
    }
    
    return false;
  } catch (error) {
    logger.error('檢查和更新所有市場資料時發生錯誤:', error);
    return false;
  }
}

/**
 * 檢查並更新證交所市場資料
 * 
 * @returns {Promise<boolean>} 如果成功更新資料返回 true，否則返回 false
 */
async function checkAndUpdateMarketData() {
  logger.info('開始檢查證交所市場資料更新...');
  
  try {
    // 獲取最新資料 (不檢查更新狀態，直接獲取)
    logger.info('正在獲取集中市場成交資料...');
    const marketInfoData = await twseAPI.getDailyMarketInfo();
    
    if (marketInfoData && marketInfoData.length > 0) {
      // 處理原始資料
      const processedData = twseAPI.processDailyMarketInfo(marketInfoData);
      
      if (processedData) {
        // 儲存到資料庫
        await saveMarketData(processedData, marketInfoData);
        logger.info(`成功更新證交所市場資料: ${processedData.date}`);
        return true;
      }
    } else {
      logger.info('無法獲取集中市場成交資料或資料為空');
    }
    
    return false;
  } catch (error) {
    logger.error('檢查和更新證交所市場資料時發生錯誤:', error);
    return false;
  }
}

/**
 * 檢查並更新期交所市場資料
 * 
 * @returns {Promise<boolean>} 如果成功更新資料返回 true，否則返回 false
 */
async function checkAndUpdateFuturesMarketData() {
  logger.info('開始檢查期交所市場資料更新...');
  
  try {
    let isUpdated = false;
    const today = format(new Date(), 'yyyy-MM-dd');
    
    // 獲取期貨大額交易人未沖銷部位資料
    logger.info('正在獲取期貨大額交易人未沖銷部位資料...');
    const largeTradersFuturesData = await taifexAPI.getLargeTradersFutures();
    
    if (largeTradersFuturesData && largeTradersFuturesData.length > 0) {
      // 處理原始資料
      const processedLargeTradersFutures = taifexAPI.processLargeTradersFutures(largeTradersFuturesData);
      
      if (processedLargeTradersFutures) {
        // 更新期貨市場資料
        await updateFuturesMarketData(processedLargeTradersFutures, {
          largeTradersFutures: largeTradersFuturesData
        });
        
        logger.info(`成功更新期貨大額交易人資料: ${processedLargeTradersFutures.date}`);
        isUpdated = true;
      }
    } else {
      logger.info('無法獲取期貨大額交易人未沖銷部位資料或資料為空');
    }
    
    // 獲取 PCR 比率資料
    logger.info('正在獲取臺指選擇權 Put/Call 比率資料...');
    const pcrData = await taifexAPI.getPutCallRatio();
    
    if (pcrData && pcrData.length > 0) {
      // 處理原始資料
      const processedPCR = taifexAPI.processPutCallRatio(pcrData);
      
      if (processedPCR) {
        // 更新期貨市場資料
        await updateFuturesMarketData(processedPCR, {
          putCallRatio: pcrData
        });
        
        logger.info(`成功更新 PCR 比率資料: ${processedPCR.date}`);
        isUpdated = true;
      }
    } else {
      logger.info('無法獲取臺指選擇權 Put/Call 比率資料或資料為空');
    }
    
    return isUpdated;
  } catch (error) {
    logger.error('檢查和更新期交所市場資料時發生錯誤:', error);
    return false;
  }
}

/**
 * 保存證交所市場資料到資料庫
 * 
 * @param {Object} processedData 處理後的資料
 * @param {Array} rawData 原始 API 資料
 */
async function saveMarketData(processedData, rawData) {
  try {
    // 檢查資料庫中是否已存在此日期的資料
    let marketData = await MarketData.findOne({ date: processedData.date });
    
    if (marketData) {
      // 更新現有資料
      marketData.taiex = processedData.taiex;
      marketData.market = processedData.market;
      marketData.lastUpdated = new Date();
      marketData.dataSources.fmtqik = {
        updated: true,
        updateTime: new Date()
      };
      marketData.rawData.fmtqik = rawData;
      
      await marketData.save();
      logger.info(`已更新既有證交所資料: ${processedData.date}`);
    } else {
      // 創建新資料
      marketData = new MarketData({
        date: processedData.date,
        taiex: processedData.taiex,
        market: processedData.market,
        dataTimestamp: new Date(),
        lastUpdated: new Date(),
        dataSources: {
          fmtqik: {
            updated: true,
            updateTime: new Date()
          }
        },
        rawData: {
          fmtqik: rawData
        }
      });
      
      await marketData.save();
      logger.info(`已創建新證交所資料: ${processedData.date}`);
    }
  } catch (error) {
    logger.error('保存證交所市場資料時發生錯誤:', error);
    throw error;
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
      
      // 更新大額交易人期貨資料
      if (processedData.txf) {
        if (!futuresData.txf) futuresData.txf = {};
        
        // 只更新有值的欄位
        if (processedData.txf.top10NetOI !== undefined) {
          futuresData.txf.top10NetOI = processedData.txf.top10NetOI;
        }
        
        if (processedData.txf.marketOI !== undefined) {
          futuresData.txf.marketOI = processedData.txf.marketOI;
        }
      }
      
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
      
      if (rawDataObj.largeTradersFutures) {
        futuresData.dataSources.largeTradersFutures = {
          updated: true,
          updateTime: new Date()
        };
        
        if (!futuresData.rawData) futuresData.rawData = {};
        futuresData.rawData.largeTradersFutures = rawDataObj.largeTradersFutures;
      }
      
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
      
      // 設置大額交易人期貨資料
      if (processedData.txf) {
        newFuturesData.txf = {
          top10NetOI: processedData.txf.top10NetOI,
          marketOI: processedData.txf.marketOI
        };
      }
      
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
      if (rawDataObj.largeTradersFutures) {
        newFuturesData.dataSources.largeTradersFutures = {
          updated: true,
          updateTime: new Date()
        };
        newFuturesData.rawData.largeTradersFutures = rawDataObj.largeTradersFutures;
      }
      
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
 * 整合證交所和期交所資料，並發送通知
 */
async function integrateAndNotify() {
  try {
    // 獲取最新的證交所資料
    const latestMarketData = await MarketData.getLatest();
    
    // 獲取最新的期交所資料
    const latestFuturesData = await FuturesMarketData.getLatest();
    
    if (!latestMarketData && !latestFuturesData) {
      logger.info('無法獲取任何市場資料，取消發送通知');
      return;
    }
    
    // 確定最新的資料日期
    let latestDate = '';
    
    if (latestMarketData && latestFuturesData) {
      // 如果兩者都有資料，使用最新的日期
      latestDate = latestMarketData.date > latestFuturesData.date 
        ? latestMarketData.date 
        : latestFuturesData.date;
    } else if (latestMarketData) {
      latestDate = latestMarketData.date;
    } else {
      latestDate = latestFuturesData.date;
    }
    
    // 使用整合後的資料發送通知
    // 這裡可以使用更新後的訊息格式進行發送
    await lineNotify.sendIntegratedUpdateNotification(latestDate);
    
    logger.info(`已發送 ${latestDate} 的整合市場資料更新通知`);
  } catch (error) {
    logger.error('整合資料並發送通知時發生錯誤:', error);
  }
}

/**
 * 更新休市日期資料
 */
async function updateHolidaySchedule() {
  logger.info('開始更新休市日期資料...');
  
  try {
    const holidayData = await twseAPI.getHolidaySchedule();
    
    if (!holidayData || !Array.isArray(holidayData)) {
      logger.error('獲取休市日期資料失敗或資料格式無效');
      return;
    }
    
    // 更新休市日資料
    for (const holiday of holidayData) {
      // 檢查資料是否完整
      if (!holiday.Date || !holiday.Name) {
        logger.warn('跳過不完整的休市日資料:', holiday);
        continue;
      }
      
      // 檢查資料庫中是否已存在此日期的資料
      let holidayRecord = await Holiday.findOne({ date: holiday.Date });
      
      if (holidayRecord) {
        // 更新現有資料
        holidayRecord.name = holiday.Name;
        holidayRecord.weekday = holiday.Weekday;
        holidayRecord.description = holiday.Description;
        holidayRecord.lastUpdated = new Date();
        
        await holidayRecord.save();
        logger.debug(`已更新休市日資料: ${holiday.Date}`);
      } else {
        // 創建新資料
        holidayRecord = new Holiday({
          date: holiday.Date,
          name: holiday.Name,
          weekday: holiday.Weekday,
          description: holiday.Description,
          lastUpdated: new Date()
        });
        
        await holidayRecord.save();
        logger.debug(`已創建休市日資料: ${holiday.Date}`);
      }
    }
    
    logger.info(`成功更新 ${holidayData.length} 筆休市日資料`);
  } catch (error) {
    logger.error('更新休市日期資料時發生錯誤:', error);
  }
}

/**
 * 清理過期資料
 * 刪除超過一個月的資料
 */
async function cleanupOldData() {
  logger.info('開始清理過期資料...');
  
  try {
    // 計算一個月前的日期
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const cutoffDate = format(oneMonthAgo, 'yyyy-MM-dd');
    
    // 刪除舊的證交所市場資料
    const marketResult = await MarketData.deleteMany({ date: { $lt: cutoffDate } });
    logger.info(`已刪除 ${marketResult.deletedCount} 筆過期證交所市場資料`);
    
    // 刪除舊的期交所市場資料
    const futuresResult = await FuturesMarketData.deleteMany({ date: { $lt: cutoffDate } });
    logger.info(`已刪除 ${futuresResult.deletedCount} 筆過期期交所市場資料`);
  } catch (error) {
    logger.error('清理過期資料時發生錯誤:', error);
  }
}

// 導出函數
module.exports = {
  initJobs,
  checkAndUpdateAllMarketData,
  checkAndUpdateMarketData,
  checkAndUpdateFuturesMarketData,
  updateHolidaySchedule
};
