/**
 * 設定檔
 * 從環境變數讀取配置參數
 */

// 資料更新排程設定（使用 cron 表達式）
const dataUpdateCron = process.env.DATA_UPDATE_CRON || '0 3 15 * * 1-5'; // 預設為每個工作日下午 3:03

// 應用程式設定
const appConfig = {
  port: process.env.PORT || 3000,
  env: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info'
};

// 資料庫設定
const dbConfig = {
  uri: process.env.MONGODB_URI,
  options: {
    useNewUrlParser: true,
    useUnifiedTopology: true
  }
};

// Line Bot 設定
const lineBotConfig = {
  channelId: process.env.LINE_CHANNEL_ID,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  notifyToken: process.env.LINE_NOTIFY_TOKEN,
  groupId: process.env.LINE_GROUP_ID
};

// API 設定
const apiConfig = {
  twse: {
    baseUrl: 'https://openapi.twse.com.tw/v1',
    timeout: 30000,  // 30 秒
    retryCount: 3,   // 失敗時重試次數
    retryDelay: 5000 // 重試間隔 (毫秒)
  }
};

// 資料清理設定
const cleanupConfig = {
  // 資料保留期限 (天)
  dataRetentionDays: 30,
  // 清理排程 (每天凌晨 3 點執行)
  cleanupCron: '0 3 * * *'
};

// 導出設定
module.exports = {
  dataUpdateCron,
  appConfig,
  dbConfig,
  lineBotConfig,
  apiConfig,
  cleanupConfig
};
