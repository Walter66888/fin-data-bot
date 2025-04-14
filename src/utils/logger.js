/**
 * 日誌記錄工具
 * 使用 winston 套件建立一致的日誌格式
 */

const winston = require('winston');
const { format, transports } = winston;
const { combine, timestamp, printf, colorize, errors } = format;

// 定義日誌格式
const logFormat = printf(({ level, message, timestamp, stack }) => {
  return `${timestamp} [${level}]: ${stack || message}`;
});

// 創建 Winston logger 實例
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    logFormat
  ),
  defaultMeta: { service: 'fin-data-bot' },
  transports: [
    // 輸出到控制台
    new transports.Console({
      format: combine(
        colorize(),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        logFormat
      )
    }),
    // 錯誤日誌輸出到檔案
    new transports.File({ 
      filename: 'logs/error.log', 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // 所有日誌輸出到檔案
    new transports.File({ 
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  ]
});

// 如果不是在生產環境，則不寫入檔案
if (process.env.NODE_ENV !== 'production') {
  logger.transports.forEach((transport) => {
    if (transport instanceof transports.File) {
      transport.silent = true;
    }
  });
}

module.exports = logger;
