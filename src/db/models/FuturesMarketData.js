/**
 * 期貨市場資料模型
 * 存儲每日期貨相關資訊及相關指數
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// 建立期貨市場資料結構
const futuresMarketDataSchema = new Schema({
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
    // 現貨與期貨價差 (基差)
    basis: {
      type: Number
    },
    // 前十大交易人淨部位
    top10NetOI: {
      type: Number
    },
    // 前十大特定法人淨部位
    top10SpecificNetOI: {
      type: Number
    },
    // 全市場未沖銷部位
    marketOI: {
      type: Number
    }
  },
  
  // 三大法人相關資料
  institutionalInvestors: {
    // 外資
    foreign: {
      // 買賣超
      netBuySell: {
        type: Number
      },
      // 台指期未平倉
      txfOI: {
        type: Number
      },
      // 小台指未平倉
      mtxOI: {
        type: Number
      },
      // 全日盤增減 (台指期)
      txfChange: {
        type: Number
      },
      // 全日盤增減 (小台指)
      mtxChange: {
        type: Number
      }
    },
    // 投信
    investment: {
      // 買賣超
      netBuySell: {
        type: Number
      }
    },
    // 自營商
    dealer: {
      // 買賣超 (合計)
      netBuySellTotal: {
        type: Number
      },
      // 買賣超 (自行買賣)
      netBuySellSelf: {
        type: Number
      },
      // 買賣超 (避險)
      netBuySellHedge: {
        type: Number
      }
    },
    // 三大法人合計買賣超
    totalNetBuySell: {
      type: Number
    }
  },
  
  // 散戶指標
  retailIndicators: {
    // 小台散戶指標
    mtx: {
      type: Number
    },
    // 小台散戶指標變化
    mtxChange: {
      type: Number
    },
    // 微台散戶指標
    mxf: {
      type: Number
    },
    // 微台散戶指標變化
    mxfChange: {
      type: Number
    }
  },
  
  // 選擇權 PCR 比率
  putCallRatio: {
    // 買權成交量
    callVolume: {
      type: Number
    },
    // 賣權成交量
    putVolume: {
      type: Number
    },
    // 成交量比率
    volumeRatio: {
      type: Number
    },
    // 買權未平倉量
    callOI: {
      type: Number
    },
    // 賣權未平倉量
    putOI: {
      type: Number
    },
    // 未平倉量比率
    oiRatio: {
      type: Number
    }
  },
  
  // VIX 指標
  vix: {
    type: Number
  },
  // 昨日 VIX 指標
  previousVix: {
    type: Number
  },
  
  // API 資料來源狀態
  dataSources: {
    // 期貨大額交易人未沖銷部位 API 狀態
    largeTradersFutures: {
      updated: {
        type: Boolean,
        default: false
      },
      updateTime: {
        type: Date
      }
    },
    // 選擇權大額交易人未沖銷部位 API 狀態
    largeTradersOptions: {
      updated: {
        type: Boolean,
        default: false
      },
      updateTime: {
        type: Date
      }
    },
    // PCR 比率 API 狀態
    putCallRatio: {
      updated: {
        type: Boolean,
        default: false
      },
      updateTime: {
        type: Date
      }
    }
  },
  
  // 原始資料備份 (用於除錯和歷史記錄)
  rawData: {
    largeTradersFutures: Schema.Types.Mixed,
    largeTradersOptions: Schema.Types.Mixed,
    putCallRatio: Schema.Types.Mixed
  }
});

// 建立索引以加速查詢
futuresMarketDataSchema.index({ date: 1 }, { unique: true });

// 加入實例方法: 檢查資料是否為當日資料
futuresMarketDataSchema.methods.isToday = function() {
  const today = new Date().toISOString().split('T')[0];
  return this.date === today;
};

// 加入靜態方法: 獲取最新的期貨市場資料
futuresMarketDataSchema.statics.getLatest = async function() {
  return this.findOne().sort({ date: -1 }).exec();
};

// 加入靜態方法: 獲取特定日期或之前最近的資料
futuresMarketDataSchema.statics.getByDateOrLatest = async function(dateStr) {
  // 先嘗試查找指定日期的資料
  const exactMatch = await this.findOne({ date: dateStr }).exec();
  if (exactMatch) return exactMatch;
  
  // 如果找不到，則查找之前最近的資料
  return this.findOne({ date: { $lt: dateStr } }).sort({ date: -1 }).exec();
};

// 建立並導出模型
const FuturesMarketData = mongoose.model('FuturesMarketData', futuresMarketDataSchema);

module.exports = FuturesMarketData;
