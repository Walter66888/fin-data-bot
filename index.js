/**
 * 主程式入口點
 * 負責初始化 Express 伺服器、Line Bot、數據庫連接和排程任務
 */

// 載入環境變數
require('dotenv').config();

// 引入必要模組
const express = require('express');
const linebot = require('linebot');
const db = require('./src/db/db');
const scheduler = require('./src/scheduler/jobs');
const logger = require('./src/utils/logger');
const twseAPI = require('./src/api/twse');

// 初始化 Express 應用程式
const app = express();
const port = process.env.PORT || 3000;

// 初始化 Line Bot
const bot = linebot({
  channelId: process.env.LINE_CHANNEL_ID,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN
});

// 使用 Line Bot 的 middleware
app.use('/webhook', bot.parser());

// 設定基本路由
app.get('/', (req, res) => {
  res.send('台灣股市盤後資料機器人服務正在運行中！');
});

// 設定健康檢查端點
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 新增: 手動觸發資料抓取的端點 (僅在開發環境或測試時使用)
app.get('/api/fetch-data', async (req, res) => {
  try {
    logger.info('手動觸發資料抓取');
    
    // 執行資料抓取
    const result = await scheduler.checkAndUpdateMarketData();
    
    if (result) {
      res.status(200).json({ 
        success: true, 
        message: '資料抓取成功',
        timestamp: new Date().toISOString() 
      });
    } else {
      res.status(200).json({ 
        success: false, 
        message: '資料尚未更新或抓取失敗',
        timestamp: new Date().toISOString() 
      });
    }
  } catch (error) {
    logger.error('手動觸發資料抓取時發生錯誤:', error);
    res.status(500).json({ 
      success: false, 
      message: '處理請求時發生錯誤',
      error: error.message,
      timestamp: new Date().toISOString() 
    });
  }
});

// 新增: 顯示最新資料的端點 (用於測試)
app.get('/api/latest-data', async (req, res) => {
  try {
    const MarketData = require('./src/db/models/MarketData');
    const latestData = await MarketData.getLatest();
    
    if (latestData) {
      res.status(200).json({
        success: true,
        data: latestData,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(404).json({
        success: false,
        message: '資料庫中沒有可用的市場資料',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    logger.error('獲取最新資料時發生錯誤:', error);
    res.status(500).json({
      success: false,
      message: '處理請求時發生錯誤',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// 載入 Line Bot 訊息處理
require('./src/linebot/bot')(bot);

// 連接到 MongoDB
db.connect()
  .then(() => {
    logger.info('成功連接到 MongoDB');
    
    // 啟動伺服器
    app.listen(port, () => {
      logger.info(`伺服器啟動成功，運行於 http://localhost:${port}`);
      
      // 初始化排程任務
      scheduler.initJobs();
      logger.info('排程任務已初始化');
    });
  })
  .catch(error => {
    logger.error('無法連接到 MongoDB:', error);
    process.exit(1);
  });

// 優雅地處理進程終止
process.on('SIGTERM', () => {
  logger.info('收到 SIGTERM 信號，正在關閉應用...');
  db.disconnect()
    .then(() => {
      logger.info('已斷開與 MongoDB 的連接');
      process.exit(0);
    })
    .catch(error => {
      logger.error('斷開 MongoDB 連接時發生錯誤:', error);
      process.exit(1);
    });
});
