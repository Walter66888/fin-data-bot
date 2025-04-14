/**
 * MongoDB 資料庫連接模組
 * 負責建立和管理與 MongoDB 的連接
 */

const mongoose = require('mongoose');
const logger = require('../utils/logger');

// 取得連接字串
const MONGODB_URI = process.env.MONGODB_URI;

// 檢查連接字串是否存在
if (!MONGODB_URI) {
  logger.error('MongoDB 連接字串未設定，請在環境變數中定義 MONGODB_URI');
  process.exit(1);
}

// 資料庫連接選項
const options = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
};

// 資料庫連接函數
const connect = async () => {
  try {
    await mongoose.connect(MONGODB_URI, options);
    return mongoose.connection;
  } catch (error) {
    logger.error('連接 MongoDB 時發生錯誤:', error);
    throw error;
  }
};

// 斷開連接函數
const disconnect = async () => {
  try {
    await mongoose.disconnect();
    logger.info('已斷開 MongoDB 連接');
  } catch (error) {
    logger.error('斷開 MongoDB 連接時發生錯誤:', error);
    throw error;
  }
};

// 監聽連接事件
mongoose.connection.on('connected', () => {
  logger.info('Mongoose 已連接到 MongoDB');
});

mongoose.connection.on('error', (err) => {
  logger.error('Mongoose 連接發生錯誤:', err);
});

mongoose.connection.on('disconnected', () => {
  logger.info('Mongoose 已斷開與 MongoDB 的連接');
});

// 導出函數
module.exports = {
  connect,
  disconnect,
  connection: mongoose.connection
};
