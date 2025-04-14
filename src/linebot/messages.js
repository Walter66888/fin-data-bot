/**
 * Line Bot 訊息模板
 * 負責格式化各種訊息的顯示格式
 */

/**
 * 格式化市場資料訊息
 * 
 * @param {Object} marketData 市場資料物件
 * @returns {string} 格式化後的訊息文字
 */
function formatMarketDataMessage(marketData) {
  if (!marketData) {
    return '無法獲取市場資料';
  }
  
  try {
    // 準備資料
    const { date, taiex, market } = marketData;
    
    // 格式化加權指數的漲跌
    const taiexChangeSymbol = taiex.change >= 0 ? '▲' : '▼';
    const taiexChangeAbs = Math.abs(taiex.change).toFixed(2);
    const taiexChangePercentFormatted = taiex.changePercent 
      ? `(${taiex.changePercent >= 0 ? '+' : ''}${taiex.changePercent.toFixed(2)}%)`
      : '';
    
    // 構建訊息文字
    let message = `📊 台股盤後資料 (${date}) 📊\n\n`;
    
    // 加權指數部分
    message += `加權指數: ${taiex.index.toLocaleString('zh-TW')} `;
    message += `${taiexChangeSymbol}${taiexChangeAbs} ${taiexChangePercentFormatted}\n`;
    
    // 成交量部分
    if (market) {
      if (market.tradeValue) {
        message += `成交金額: ${market.tradeValue.toFixed(2)} 億元\n`;
      }
      
      if (market.tradeVolume) {
        message += `成交股數: ${market.tradeVolume.toFixed(2)} 億股\n`;
      }
      
      if (market.transaction) {
        message += `成交筆數: ${market.transaction.toFixed(2)} 千筆\n`;
      }
    }
    
    // 更新時間
    message += `\n資料更新時間: ${new Date(marketData.lastUpdated).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`;
    
    return message;
  } catch (error) {
    console.error('格式化市場資料訊息時發生錯誤:', error);
    return '格式化資料時發生錯誤，請聯繫管理員。';
  }
}

/**
 * 格式化通知訊息
 * 用於當新資料更新時發送通知
 * 
 * @param {Object} marketData 最新的市場資料
 * @returns {string} 格式化後的通知訊息
 */
function formatUpdateNotification(marketData) {
  if (!marketData) {
    return '無法獲取市場資料更新';
  }
  
  try {
    // 準備資料
    const { date, taiex } = marketData;
    
    // 格式化加權指數的漲跌
    const taiexChangeSymbol = taiex.change >= 0 ? '▲' : '▼';
    const taiexChangeAbs = Math.abs(taiex.change).toFixed(2);
    const taiexChangePercentFormatted = taiex.changePercent 
      ? `(${taiex.changePercent >= 0 ? '+' : ''}${taiex.changePercent.toFixed(2)}%)`
      : '';
    
    // 構建訊息文字
    let message = `🔔 盤後資料更新通知 🔔\n\n`;
    message += `${date} 台股盤後資料已更新\n`;
    message += `加權指數: ${taiex.index.toLocaleString('zh-TW')} `;
    message += `${taiexChangeSymbol}${taiexChangeAbs} ${taiexChangePercentFormatted}\n\n`;
    message += `輸入「盤後資料」查看完整資訊`;
    
    return message;
  } catch (error) {
    console.error('格式化更新通知訊息時發生錯誤:', error);
    return '市場資料已更新，輸入「盤後資料」查看詳情。';
  }
}

// 導出函數
module.exports = {
  formatMarketDataMessage,
  formatUpdateNotification
};
