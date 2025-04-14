/**
 * Line Bot 訊息模板
 * 負責格式化各種訊息的顯示格式，包含整合的證交所和期交所資料
 */

const MarketData = require('../db/models/MarketData');
const FuturesMarketData = require('../db/models/FuturesMarketData');
const logger = require('../utils/logger');

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
    logger.error('格式化市場資料訊息時發生錯誤:', error);
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
    logger.error('格式化更新通知訊息時發生錯誤:', error);
    return '市場資料已更新，輸入「盤後資料」查看詳情。';
  }
}

/**
 * 格式化整合市場資料訊息
 * 
 * @param {string} date 日期字串 (YYYY-MM-DD)
 * @returns {Promise<string>} 格式化後的訊息文字
 */
async function formatIntegratedMarketDataMessage(date) {
  try {
    // 獲取該日期的證交所資料，如果沒有則取最近的
    let marketData = await MarketData.findOne({ date });
    if (!marketData) {
      marketData = await MarketData.findOne({ date: { $lt: date } }).sort({ date: -1 }).limit(1);
    }
    
    // 獲取該日期的期交所資料，如果沒有則取最近的
    let futuresData = await FuturesMarketData.findOne({ date });
    if (!futuresData) {
      futuresData = await FuturesMarketData.findOne({ date: { $lt: date } }).sort({ date: -1 }).limit(1);
    }
    
    if (!marketData && !futuresData) {
      return `無法獲取 ${date} 或之前的市場資料`;
    }
    
    // 記錄實際資料日期
    const marketDataDate = marketData ? marketData.date : '無資料';
    const futuresDataDate = futuresData ? futuresData.date : '無資料';
    
    // 構建訊息文字
    let message = `📊 台股盤後資料整合分析 📊\n`;
    
    // 如果實際資料日期與查詢日期不同，提示用戶
    if (marketDataDate !== date || futuresDataDate !== date) {
      message += `⚠️ 注意：顯示的是不同日期的資料\n`;
      if (marketData) message += `證交所資料日期: ${marketDataDate}\n`;
      if (futuresData) message += `期交所資料日期: ${futuresDataDate}\n`;
    } else {
      message += `日期: ${date}\n`;
    }
    
    message += `\n`;
    
    // 加權指數部分 (來自證交所資料)
    if (marketData && marketData.taiex) {
      const { taiex, market } = marketData;
      
      // 格式化加權指數的漲跌
      const taiexChangeSymbol = taiex.change >= 0 ? '▲' : '▼';
      const taiexChangeAbs = Math.abs(taiex.change).toFixed(2);
      const taiexChangePercentFormatted = taiex.changePercent 
        ? `(${taiex.changePercent >= 0 ? '+' : ''}${taiex.changePercent.toFixed(2)}%)`
        : '';
      
      message += `加權指數[${marketDataDate}]: ${taiex.index.toLocaleString('zh-TW')} `;
      message += `${taiexChangeSymbol}${taiexChangeAbs} ${taiexChangePercentFormatted}`;
      
      if (market && market.tradeValue) {
        message += ` ${market.tradeValue.toFixed(2)} 億元`;
      }
      
      message += '\n';
    } else {
      message += `加權指數資料: 暫無可用資料\n`;
    }
    
    // 台指期部分 (來自期交所資料)
    if (futuresData && futuresData.txf) {
      const { txf } = futuresData;
      
      if (txf.price) {
        // 格式化台指期的漲跌
        const txfChangeSymbol = txf.change >= 0 ? '▲' : '▼';
        const txfChangeAbs = Math.abs(txf.change).toFixed(0);
        const txfChangePercentFormatted = txf.changePercent 
          ? `(${txf.changePercent >= 0 ? '+' : ''}${txf.changePercent.toFixed(2)}%)`
          : '';
        
        message += `台指期(近)[${futuresDataDate}]: ${txf.price.toLocaleString('zh-TW')} `;
        message += `${txfChangeSymbol}${txfChangeAbs} ${txfChangePercentFormatted}`;
        
        // 若有基差資料
        if (txf.basis) {
          message += ` ${txf.basis.toFixed(2)} (價差)`;
        }
        
        message += '\n';
      }
      
      // 增加十大交易人資料
      if (txf.top10NetOI !== undefined) {
        const changeSymbol = txf.top10NetOI >= 0 ? '+' : '';
        message += `十大交易人[${futuresDataDate}]: ${changeSymbol}${txf.top10NetOI.toLocaleString('zh-TW')} (未平倉)\n`;
      }
    } else {
      message += `台指期資料: 暫無可用資料\n`;
    }
    
    // 三大法人資料 (可能來自任一或兩者整合)
    if (futuresData && futuresData.institutionalInvestors) {
      const { institutionalInvestors } = futuresData;
      
      message += `\n🏢 三大法人現貨買賣超(億元)[${futuresDataDate}]`;
      
      if (institutionalInvestors.totalNetBuySell !== undefined) {
        const changeSymbol = institutionalInvestors.totalNetBuySell >= 0 ? '+' : '';
        message += ` ${changeSymbol}${institutionalInvestors.totalNetBuySell.toFixed(2)}`;
      }
      
      message += '\n';
      
      // 外資
      if (institutionalInvestors.foreign && institutionalInvestors.foreign.netBuySell !== undefined) {
        const foreignChangeSymbol = institutionalInvestors.foreign.netBuySell >= 0 ? '+' : '';
        message += `外資買賣超: ${foreignChangeSymbol}${institutionalInvestors.foreign.netBuySell.toFixed(2)}\n`;
      }
      
      // 投信
      if (institutionalInvestors.investment && institutionalInvestors.investment.netBuySell !== undefined) {
        const investmentChangeSymbol = institutionalInvestors.investment.netBuySell >= 0 ? '+' : '';
        message += `投信買賣超: ${investmentChangeSymbol}${institutionalInvestors.investment.netBuySell.toFixed(2)}\n`;
      }
      
      // 自營商
      if (institutionalInvestors.dealer) {
        const dealer = institutionalInvestors.dealer;
        
        if (dealer.netBuySellTotal !== undefined) {
          const dealerTotalChangeSymbol = dealer.netBuySellTotal >= 0 ? '+' : '';
          message += `自營商買賣超(合計): ${dealerTotalChangeSymbol}${dealer.netBuySellTotal.toFixed(2)}\n`;
        }
        
        if (dealer.netBuySellSelf !== undefined) {
          const dealerSelfChangeSymbol = dealer.netBuySellSelf >= 0 ? '+' : '';
          message += `自買: ${dealerSelfChangeSymbol}${dealer.netBuySellSelf.toFixed(2)}\n`;
        }
        
        if (dealer.netBuySellHedge !== undefined) {
          const dealerHedgeChangeSymbol = dealer.netBuySellHedge >= 0 ? '+' : '';
          message += `避險: ${dealerHedgeChangeSymbol}${dealer.netBuySellHedge.toFixed(2)}\n`;
        }
      }
    } else {
      message += `\n三大法人資料: 暫無可用資料\n`;
    }
    
    // 外資及大額交易人期貨資料
    if (futuresData && futuresData.institutionalInvestors && futuresData.institutionalInvestors.foreign) {
      const { foreign } = futuresData.institutionalInvestors;
      
      if (foreign.txfOI !== undefined || foreign.mtxOI !== undefined || foreign.txfChange !== undefined || foreign.mtxChange !== undefined) {
        message += `\n📈 外資及大額交易人期貨(口)[${futuresDataDate}] 未平倉 全日盤增減\n`;
        
        if (foreign.txfOI !== undefined) {
          const txfOIString = foreign.txfOI.toLocaleString('zh-TW');
          const txfChangeString = foreign.txfChange !== undefined 
            ? (foreign.txfChange >= 0 ? '+' : '') + foreign.txfChange.toLocaleString('zh-TW') 
            : 'N/A';
          
          message += `外資台指期: ${txfOIString} ${txfChangeString}\n`;
        }
        
        if (foreign.mtxOI !== undefined) {
          const mtxOIString = foreign.mtxOI.toLocaleString('zh-TW');
          const mtxChangeString = foreign.mtxChange !== undefined 
            ? (foreign.mtxChange >= 0 ? '+' : '') + foreign.mtxChange.toLocaleString('zh-TW') 
            : 'N/A';
          
          message += `外資小台指: ${mtxOIString} ${mtxChangeString}\n`;
        }
      }
    }
    
    // PCR 比率資料
    if (futuresData && futuresData.putCallRatio) {
      const { putCallRatio } = futuresData;
      
      if (putCallRatio.oiRatio !== undefined) {
        const previousValue = futuresData.previousPutCallRatio ? futuresData.previousPutCallRatio.oiRatio : null;
        const previousString = previousValue !== null ? `/${previousValue.toFixed(0)}` : '';
        
        message += `\nPCratio 未平倉比[${futuresDataDate}]: ${putCallRatio.oiRatio.toFixed(0)}${previousString}\n`;
      }
    }
    
    // VIX 指標
    if (futuresData && futuresData.vix !== undefined) {
      const previousVix = futuresData.previousVix !== undefined 
        ? `/${futuresData.previousVix.toFixed(2)}` 
        : '';
      
      message += `VIX 指標[${futuresDataDate}]: ${futuresData.vix.toFixed(2)}${previousVix}\n`;
    }
    
    // 散戶指標
    if (futuresData && futuresData.retailIndicators) {
      const { retailIndicators } = futuresData;
      
      message += `\n📊 散戶指標[${futuresDataDate}]\n`;
      
      if (retailIndicators.mtx !== undefined) {
        const mtxChangeString = retailIndicators.mtxChange !== undefined 
          ? `/${(retailIndicators.mtxChange >= 0 ? '+' : '') + retailIndicators.mtxChange.toFixed(2)}%` 
          : '';
        
        message += `小台散戶指標: ${retailIndicators.mtx.toFixed(2)}%${mtxChangeString}\n`;
      }
      
      if (retailIndicators.mxf !== undefined) {
        const mxfChangeString = retailIndicators.mxfChange !== undefined 
          ? `/${(retailIndicators.mxfChange >= 0 ? '+' : '') + retailIndicators.mxfChange.toFixed(2)}%` 
          : '';
        
        message += `微台散戶指標: ${retailIndicators.mxf.toFixed(2)}%${mxfChangeString}\n`;
      }
    }
    
    // 更新時間
    const lastUpdated = (marketData && futuresData) 
      ? (marketData.lastUpdated > futuresData.lastUpdated ? marketData.lastUpdated : futuresData.lastUpdated)
      : (marketData ? marketData.lastUpdated : (futuresData ? futuresData.lastUpdated : new Date()));
    
    message += `\n資料更新時間: ${new Date(lastUpdated).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`;
    
    return message;
  } catch (error) {
    logger.error('格式化整合市場資料訊息時發生錯誤:', error);
    return '格式化整合資料時發生錯誤，請聯繫管理員。';
  }
}

/**
 * 格式化整合市場資料更新通知
 * 
 * @param {string} date 日期字串 (YYYY-MM-DD)
 * @returns {Promise<string>} 格式化後的通知訊息
 */
async function formatIntegratedUpdateNotification(date) {
  try {
    // 獲取該日期的證交所資料，如果沒有則取最近的
    let marketData = await MarketData.findOne({ date });
    if (!marketData) {
      marketData = await MarketData.findOne().sort({ date: -1 }).limit(1);
    }
    
    // 獲取該日期的期交所資料，如果沒有則取最近的
    let futuresData = await FuturesMarketData.findOne({ date });
    if (!futuresData) {
      futuresData = await FuturesMarketData.findOne().sort({ date: -1 }).limit(1);
    }
    
    if (!marketData && !futuresData) {
      return `無法獲取 ${date} 的市場資料更新`;
    }
    
    // 記錄實際資料日期
    const marketDataDate = marketData ? marketData.date : '無資料';
    const futuresDataDate = futuresData ? futuresData.date : '無資料';
    
    // 構建訊息文字
    let message = `🔔 盤後資料更新通知 🔔\n\n`;
    
    // 如果實際資料日期與查詢日期不同，提示用戶
    if (marketDataDate !== date || futuresDataDate !== date) {
      message += `可用的最新資料:\n`;
      if (marketData) message += `證交所資料日期: ${marketDataDate}\n`;
      if (futuresData) message += `期交所資料日期: ${futuresDataDate}\n\n`;
    } else {
      message += `${date} 台股盤後資料已更新\n\n`;
    }
    
    // 加權指數部分 (來自證交所資料)
    if (marketData && marketData.taiex) {
      const { taiex } = marketData;
      
      // 格式化加權指數的漲跌
      const taiexChangeSymbol = taiex.change >= 0 ? '▲' : '▼';
      const taiexChangeAbs = Math.abs(taiex.change).toFixed(2);
      const taiexChangePercentFormatted = taiex.changePercent 
        ? `(${taiex.changePercent >= 0 ? '+' : ''}${taiex.changePercent.toFixed(2)}%)`
        : '';
      
      message += `加權指數[${marketDataDate}]: ${taiex.index.toLocaleString('zh-TW')} `;
      message += `${taiexChangeSymbol}${taiexChangeAbs} ${taiexChangePercentFormatted}\n`;
    }
    
    // 台指期部分 (來自期交所資料)
    if (futuresData && futuresData.txf && futuresData.txf.price) {
      const { txf } = futuresData;
      
      // 格式化台指期的漲跌
      const txfChangeSymbol = txf.change >= 0 ? '▲' : '▼';
      const txfChangeAbs = Math.abs(txf.change).toFixed(0);
      const txfChangePercentFormatted = txf.changePercent 
        ? `(${txf.changePercent >= 0 ? '+' : ''}${txf.changePercent.toFixed(2)}%)`
        : '';
      
      message += `台指期(近)[${futuresDataDate}]: ${txf.price.toLocaleString('zh-TW')} `;
      message += `${txfChangeSymbol}${txfChangeAbs} ${txfChangePercentFormatted}\n`;
    }
    
    // 三大法人合計買賣超
    if (futuresData && futuresData.institutionalInvestors && futuresData.institutionalInvestors.totalNetBuySell !== undefined) {
      const { totalNetBuySell } = futuresData.institutionalInvestors;
      const changeSymbol = totalNetBuySell >= 0 ? '+' : '';
      
      message += `三大法人買賣超[${futuresDataDate}]: ${changeSymbol}${totalNetBuySell.toFixed(2)} 億元\n`;
    }
    
    message += `\n輸入「整合資料」查看完整資訊`;
    
    return message;
  } catch (error) {
    logger.error('格式化整合更新通知訊息時發生錯誤:', error);
    return '市場資料已更新，輸入「整合資料」查看詳情。';
  }
}

// 導出函數
module.exports = {
  formatMarketDataMessage,
  formatUpdateNotification,
  formatIntegratedMarketDataMessage,
  formatIntegratedUpdateNotification
};
