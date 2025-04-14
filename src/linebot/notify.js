/**
 * Line Notify 通知模組
 * 用於發送 Line 通知到指定群組
 */

const axios = require('axios');
const logger = require('../utils/logger');
const messages = require('./messages');
const MarketData = require('../db/models/MarketData');

// Line Notify API URL
const LINE_NOTIFY_API = 'https://notify-api.line.me/api/notify';

// 獲取 Line Notify 令牌
const LINE_NOTIFY_TOKEN = process.env.LINE_NOTIFY_TOKEN;
const LINE_GROUP_ID = process.env.LINE_GROUP_ID;

// 記錄上次通知日期的變量，避免重複通知
let lastNotifiedDate = null;

/**
 * 發送 Line Notify 通知
 * 
 * @param {string} message 通知訊息
 * @returns {Promise<boolean>} 發送成功返回 true，否則返回 false
 */
async function sendNotify(message) {
  // 檢查是否設定 Line Notify 令牌
  if (!LINE_NOTIFY_TOKEN) {
    logger.error('未設定 LINE_NOTIFY_TOKEN，無法發送通知');
    return false;
  }
  
  try {
    // 準備請求參數
    const params = new URLSearchParams();
    params.append('message', message);
    
    // 發送通知請求
    const response = await axios.post(LINE_NOTIFY_API, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Bearer ${LINE_NOTIFY_TOKEN}`
      }
    });
    
    // 檢查回應狀態
    if (response.status === 200 && response.data.status === 200) {
      logger.info('成功發送 Line 通知');
      return true;
    } else {
      logger.error(`發送 Line 通知失敗: ${response.data.message}`);
      return false;
    }
  } catch (error) {
    logger.error('發送 Line 通知時發生錯誤:', error);
    return false;
  }
}

/**
 * 發送市場資料更新通知
 * 當有新的市場資料時，發送通知到群組
 * 
 * @param {Object} marketData 市場資料物件
 * @returns {Promise<boolean>} 發送成功返回 true，否則返回 false
 */
async function sendUpdateNotification(marketData) {
  try {
    // 檢查是否為當天的資料
    const currentDate = new Date().toISOString().split('T')[0];
    
    // 避免同一天重複發送通知
    if (lastNotifiedDate === marketData.date) {
      logger.info(`今日 (${marketData.date}) 已經發送過通知，不再重複發送`);
      return false;
    }
    
    // 格式化通知訊息
    const message = messages.formatUpdateNotification(marketData);
    
    // 發送通知
    const success = await sendNotify(message);
    
    if (success) {
      // 更新最後通知日期
      lastNotifiedDate = marketData.date;
      logger.info(`已發送 ${marketData.date} 的市場資料更新通知`);
    }
    
    return success;
  } catch (error) {
    logger.error('準備發送更新通知時發生錯誤:', error);
    return false;
  }
}

/**
 * 推送最新的市場資料到群組
 * 用於定時推送或手動觸發
 * 
 * @returns {Promise<boolean>} 推送成功返回 true，否則返回 false
 */
async function pushLatestMarketData() {
  try {
    // 從資料庫獲取最新的市場資料
    const latestData = await MarketData.getLatest();
    
    if (!latestData) {
      logger.error('無法獲取最新市場資料，取消推送');
      return false;
    }
    
    // 檢查是否為當天的資料
    const currentDate = new Date().toISOString().split('T')[0];
    
    // 避免同一天重複發送通知
    if (lastNotifiedDate === latestData.date) {
      logger.info(`今日 (${latestData.date}) 已經發送過通知，不再重複發送`);
      return false;
    }
    
    // 格式化完整的市場資料訊息
    const message = messages.formatMarketDataMessage(latestData);
    
    // 發送通知
    const success = await sendNotify(message);
    
    if (success) {
      // 更新最後通知日期
      lastNotifiedDate = latestData.date;
      logger.info(`已推送 ${latestData.date} 的完整市
