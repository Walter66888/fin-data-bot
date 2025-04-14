/**
 * 檢查並更新市場資料
 * 此函數會檢查 API 資料是否已更新，如果已更新則保存到資料庫
 * 
 * @returns {Promise<boolean>} 如果成功更新資料返回 true，否則返回 false
 */
async function checkAndUpdateMarketData() {
  logger.info('開始檢查市場資料更新...');
  
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
        logger.info(`成功更新市場資料: ${processedData.date}`);
        
        // 如果需要通知，可以在這裡發送
        // await lineNotify.sendUpdateNotification(processedData);
        
        return true;
      }
    } else {
      logger.info('無法獲取集中市場成交資料或資料為空');
      
      // 安排在一段時間後再次檢查
      setTimeout(() => {
        // 安排下一次檢查（30分鐘後）
        scheduleMarketDataUpdate();
      }, 30 * 60 * 1000); // 30 分鐘
    }
    
    return false;
  } catch (error) {
    logger.error('檢查和更新市場資料時發生錯誤:', error);
    return false;
  }
}
