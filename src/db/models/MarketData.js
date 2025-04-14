/**
 * 市場資料模型
 * 存儲每日市場成交資訊及相關指數
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// 建立市場資料結構
const marketDataSchema = new Schema({
  // 日期 (主鍵，格式: YYYY-MM-DD)
  date: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // 原始資料時間戳 (用於判斷資料新鮮度)
  dataTimestamp: {
    type: Date,
    default: Date.now
  },
  
  // 最後更新時間
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  
  // 加權指數相關資料
  taiex: {
    // 發行量加權股價指數
    index: {
      type: Number,
      required: true
    },
    // 漲跌點數
    change: {
      type: Number,
      required: true
    },
    // 漲跌百分比
    changePercent: {
      type: Number
    },
    // 成交金額 (億元)
    tradeValue: {
      type: Number
    }
  },
  
  // 成交量資料
  market: {
    // 成交股數 (億股)
    tradeVolume: {
      type: Number
    },
    // 成交金額 (億元)
    tradeValue: {
      type: Number
    },
    // 成交筆數 (千筆)
    transaction: {
      type: Number
    }
  },
  
  // 台指期相關資料
  txf: {
    // 台指期近月價格
    price: {
      type: Number
    },
    // 台指期漲跌點數
    change: {
      type: Number
    },
    // 台指期漲跌百分比
    changePercent: {
      type: Number
    },
    // 現貨與期貨價差
    basis: {
      type: Number
    }
  },
  
  // API 資料來源狀態
  dataSources: {
    // 集中市場每日成交資料 API 狀態
    fmtqik: {
      updated: {
        type: Boolean,
        default: false
      },
      updateTime: {
        type: Date
      }
    },
    // 其他 API 狀態可以在這裡添加
    // ...
  },
  
  // 原始資料備份 (用於除錯和歷史記錄)
  rawData: {
    fmtqik: Schema.Types.Mixed,
    // 其他 API 原始資料
    // ...
  }
});

// 建立索引以加速查詢
marketDataSchema.index({ date: 1 }, { unique: true });

// 加入實例方法: 檢查資料是否為當日資料
marketDataSchema.methods.isToday = function() {
  const today = new Date().toISOString().split('T')[0];
  return this.date === today;
};

// 加入靜態方法: 獲取最新的市場資料
marketDataSchema.statics.getLatest = async function() {
  return this.findOne().sort({ date: -1 }).exec();
};

// 加入靜態方法: 獲取特定日期或之前最近的資料
marketDataSchema.statics.getByDateOrLatest = async function(dateStr) {
  // 先嘗試查找指定日期的資料
  const exactMatch = await this.findOne({ date: dateStr }).exec();
  if (exactMatch) return exactMatch;
  
  // 如果找不到，則查找之前最近的資料
  return this.findOne({ date: { $lt: dateStr } }).sort({ date: -1 }).exec();
};

// 建立並導出模型
const MarketData = mongoose.model('MarketData', marketDataSchema);

module.exports = MarketData;
