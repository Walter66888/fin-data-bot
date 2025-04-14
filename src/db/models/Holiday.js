/**
 * 休市日資料模型
 * 存儲有價證券集中交易市場開（休）市日期資訊
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// 建立休市日結構
const holidaySchema = new Schema({
  // 日期 (主鍵，格式: YYYY-MM-DD)
  date: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // 名稱 (如：臺灣證券交易所)
  name: {
    type: String,
    required: true
  },
  
  // 星期
  weekday: {
    type: String
  },
  
  // 說明 (如：週休二日)
  description: {
    type: String
  },
  
  // 最後更新時間
  lastUpdated: {
    type: Date,
    default: Date.now
  }
});

// 建立索引以加速查詢
holidaySchema.index({ date: 1 }, { unique: true });

// 加入靜態方法: 檢查指定日期是否為休市日
holidaySchema.statics.isHoliday = async function(dateStr) {
  const count = await this.countDocuments({ date: dateStr });
  return count > 0;
};

// 加入靜態方法: 獲取指定日期之後的下一個交易日
holidaySchema.statics.getNextTradingDay = async function(dateStr) {
  // 從指定日期開始檢查每一天是否為交易日
  let currentDateObj = new Date(dateStr);
  currentDateObj.setDate(currentDateObj.getDate() + 1);
  
  let isNextTradingDayFound = false;
  let maxAttempts = 10; // 最多檢查10天，避免無限循環
  let attempts = 0;
  
  while (!isNextTradingDayFound && attempts < maxAttempts) {
    const currentDateStr = currentDateObj.toISOString().split('T')[0];
    
    // 檢查是否為週末 (週六=6, 週日=0)
    const dayOfWeek = currentDateObj.getDay();
    const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
    
    // 檢查是否為休市日
    const isHolidayDay = await this.isHoliday(currentDateStr);
    
    if (!isWeekend && !isHolidayDay) {
      // 非週末且非休市日，即為交易日
      isNextTradingDayFound = true;
      return currentDateStr;
    }
    
    // 前進一天
    currentDateObj.setDate(currentDateObj.getDate() + 1);
    attempts++;
  }
  
  // 如果無法找到下一個交易日
  return null;
};

// 加入靜態方法: 獲取指定日期之前的上一個交易日
holidaySchema.statics.getPreviousTradingDay = async function(dateStr) {
  // 從指定日期開始檢查每一天是否為交易日
  let currentDateObj = new Date(dateStr);
  currentDateObj.setDate(currentDateObj.getDate() - 1);
  
  let isPrevTradingDayFound = false;
  let maxAttempts = 10; // 最多檢查10天，避免無限循環
  let attempts = 0;
  
  while (!isPrevTradingDayFound && attempts < maxAttempts) {
    const currentDateStr = currentDateObj.toISOString().split('T')[0];
    
    // 檢查是否為週末 (週六=6, 週日=0)
    const dayOfWeek = currentDateObj.getDay();
    const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
    
    // 檢查是否為休市日
    const isHolidayDay = await this.isHoliday(currentDateStr);
    
    if (!isWeekend && !isHolidayDay) {
      // 非週末且非休市日，即為交易日
      isPrevTradingDayFound = true;
      return currentDateStr;
    }
    
    // 後退一天
    currentDateObj.setDate(currentDateObj.getDate() - 1);
    attempts++;
  }
  
  // 如果無法找到上一個交易日
  return null;
};

// 建立並導出模型
const Holiday = mongoose.model('Holiday', holidaySchema);

module.exports = Holiday;
