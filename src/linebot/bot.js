/**
 * Line Bot 處理模組
 * 負責處理 Line Bot 的訊息和事件
 */

const logger = require('../utils/logger');
const MarketData = require('../db/models/MarketData');
const Holiday = require('../db/models/Holiday');
const { format, parse, isValid } = require('date-fns');
const messages = require('./messages');

// Line Bot 消息處理器
module.exports = function(bot) {
  // 當收到文字訊息時
  bot.on('message', async function(event) {
    // 只處理文字訊息
    if (event.message.type !== 'text') return;
    
    const userId = event.source.userId;
    const text = event.message.text.trim();
    logger.info(`收到來自用戶 ${userId} 的訊息: ${text}`);
    
    try {
      // 檢查是否為盤後資料查詢
      if (text === '盤後資料' || text.startsWith('盤後資料')) {
        await handleMarketDataQuery(event);
      }
      // 可以在這裡添加其他命令處理
      else {
        // 未知命令提示
        await event.reply('您可以輸入「盤後資料」查詢最新盤後籌碼資訊，或輸入「盤後資料YYYYMMDD」查詢特定日期的資料。');
      }
    } catch (error) {
      logger.error(`處理用戶訊息時發生錯誤:`, error);
      await event.reply('抱歉，處理您的請求時發生錯誤，請稍後再試。');
    }
  });

  // 處理盤後資料查詢
  async function handleMarketDataQuery(event) {
    const text = event.message.text.trim();
    let dateStr = null;
    
    // 解析查詢日期
    if (text === '盤後資料') {
      // 如果僅輸入「盤後資料」，查詢最新資料
      dateStr = format(new Date(), 'yyyy-MM-dd');
    } else {
      // 從「盤後資料YYYYMMDD」格式解析日期
      const datePattern = /盤後資料(\d{8})/;
      const match = text.match(datePattern);
      
      if (match && match[1]) {
        // 解析 YYYYMMDD 格式
        const yearStr = match[1].substring(0, 4);
        const monthStr = match[1].substring(4, 6);
        const dayStr = match[1].substring(6, 8);
        
        // 驗證日期格式
        const inputDate = parse(`${yearStr}-${monthStr}-${dayStr}`, 'yyyy-MM-dd', new Date());
        
        if (isValid(inputDate)) {
          dateStr = format(inputDate, 'yyyy-MM-dd');
        } else {
          await event.reply('日期格式無效，請使用「盤後資料YYYYMMDD」格式。例如：盤後資料20250415');
          return;
        }
      } else {
        await event.reply('無法識別您的查詢，正確格式為「盤後資料」或「盤後資料YYYYMMDD」');
        return;
      }
    }
    
    // 查詢任何可用資料
    const latestData = await MarketData.getLatest();
    
    // 如果資料庫中沒有資料，嘗試立即抓取
    if (!latestData) {
      await event.reply('正在嘗試獲取最新盤後資料，請稍候...');
      
      try {
        // 引入排程模組
        const scheduler = require('../scheduler/jobs');
        
        // 嘗試立即抓取資料
        const fetchResult = await scheduler.checkAndUpdateMarketData();
        
        if (fetchResult) {
          // 如果成功抓取，再次查詢最新資料
          const newData = await MarketData.getLatest();
          
          if (newData) {
            const formattedMessage = messages.formatMarketDataMessage(newData);
            await event.reply(formattedMessage);
            return;
          }
        }
        
        // 如果仍然無法獲取資料
        await event.reply('抱歉，無法獲取盤後資料，可能是資料尚未發布或系統正在維護中。請稍後再試。');
        return;
      } catch (error) {
        logger.error('立即抓取資料時發生錯誤:', error);
        await event.reply('抱歉，獲取資料時發生錯誤，請稍後再試。');
        return;
      }
    }
    
    // 如果有指定日期，嘗試查找該日期的資料
    if (dateStr !== format(new Date(), 'yyyy-MM-dd')) {
      const specificData = await MarketData.findOne({ date: dateStr });
      
      if (specificData) {
        // 找到指定日期的資料
        const formattedMessage = messages.formatMarketDataMessage(specificData);
        await event.reply(formattedMessage);
        return;
      } else {
        // 找不到指定日期的資料，顯示最新資料
        await event.reply(`找不到 ${dateStr} 的盤後資料，將顯示最新的盤後資料 (${latestData.date})。`);
      }
    }
    
    // 顯示最新資料
    const formattedMessage = messages.formatMarketDataMessage(latestData);
    await event.reply(formattedMessage);
  }
};
