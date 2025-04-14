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
    
    // 檢查指定日期是否為交易日
    const isHoliday = await Holiday.isHoliday(dateStr);
    const dayOfWeek = new Date(dateStr).getDay();
    const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
    
    if (isHoliday || isWeekend) {
      // 如果是休市日或週末，提示用戶並查找上一個交易日
      const prevTradingDay = await Holiday.getPreviousTradingDay(dateStr);
      
      if (prevTradingDay) {
        await event.reply(`${dateStr} 為非交易日，將顯示 ${prevTradingDay} 的盤後資料。`);
        dateStr = prevTradingDay;
      } else {
        await event.reply(`${dateStr} 為非交易日，且無法找到前一個交易日的資料。`);
        return;
      }
    }
    
    // 查詢指定日期的資料
    const marketData = await MarketData.findOne({ date: dateStr });
    
    if (marketData) {
      // 找到資料，回覆格式化訊息
      const formattedMessage = messages.formatMarketDataMessage(marketData);
      await event.reply(formattedMessage);
    } else {
      // 如果找不到指定日期的資料，查找最近的資料
      const latestData = await MarketData.getLatest();
      
      if (latestData) {
        await event.reply(`找不到 ${dateStr} 的盤後資料，將顯示最新的盤後資料 (${latestData.date})。`);
        const formattedMessage = messages.formatMarketDataMessage(latestData);
        await event.reply(formattedMessage);
      } else {
        await event.reply('抱歉，目前資料庫中沒有盤後資料。');
      }
    }
  }
};
