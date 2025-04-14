/**
 * Line Bot 處理模組
 * 負責處理 Line Bot 的訊息和事件，支援整合資料查詢
 */

const logger = require('../utils/logger');
const MarketData = require('../db/models/MarketData');
const FuturesMarketData = require('../db/models/FuturesMarketData');
const Holiday = require('../db/models/Holiday');
const { format, parse, isValid } = require('date-fns');
const messages = require('./messages');

// Line Bot 消息處理器
module.exports = function(bot) {
  // 當收到文字訊息時
  bot.on('message', async function(event) {
    // 只處理文字訊息
    if (event.message.type !== 'text') return;
    
    const userId = event.source.userId;
    const text = event.message.text.trim();
    logger.info(`收到來自用戶 ${userId} 的訊息: ${text}`);
    
    try {
      // 檢查是否為盤後資料查詢
      if (text === '盤後資料' || text.startsWith('盤後資料')) {
        await handleMarketDataQuery(event);
      }
      // 檢查是否為盤後籌碼快報查詢
      else if (text === '籌碼快報' || text.startsWith('籌碼快報')) {
        await handleChipDataQuery(event);
      }
      // 檢查是否為盤後期貨資料查詢
      else if (text === '期貨資料' || text.startsWith('期貨資料')) {
        await handleFuturesDataQuery(event);
      }
      // 檢查是否為盤後整合資料查詢
      else if (text === '整合資料' || text.startsWith('整合資料')) {
        await handleIntegratedDataQuery(event);
      }
      // 可以在這裡添加其他命令處理
      else {
        // 未知命令提示
        await event.reply([
          '您可以使用以下指令：',
          '「盤後資料」- 查詢最新盤後加權指數與成交量資訊',
          '「期貨資料」- 查詢最新期貨相關資訊',
          '「籌碼快報」- 查詢最新三大法人買賣超資訊',
          '「整合資料」- 查詢最新整合盤後資訊',
          '',
          '您也可以加上日期查詢特定日期的資料，例如：「整合資料20250414」'
        ].join('\n'));
      }
    } catch (error) {
      logger.error(`處理用戶訊息時發生錯誤:`, error);
      await event.reply('抱歉，處理您的請求時發生錯誤，請稍後再試。');
    }
  });

  // 處理盤後資料查詢（集中市場加權指數）
  async function handleMarketDataQuery(event) {
    const text = event.message.text.trim();
    let dateStr = await parseDateFromCommand(text, '盤後資料');
    
    if (!dateStr) {
      await event.reply('日期格式無效，請使用「盤後資料YYYYMMDD」格式。例如：盤後資料20250415');
      return;
    }
    
    // 查詢資料
    const marketData = await findMarketData(dateStr);
    
    if (marketData) {
      // 如果返回的資料日期與查詢日期不同，提示用戶
      if (marketData.date !== dateStr) {
        await event.reply(`找不到 ${dateStr} 的盤後資料，將顯示最近的交易日 ${marketData.date} 的資料。`);
      }
      
      // 找到資料，回覆格式化訊息
      const formattedMessage = messages.formatMarketDataMessage(marketData);
      await event.reply(formattedMessage);
    } else {
      await event.reply(`找不到 ${dateStr} 的盤後資料，可能是非交易日或資料尚未更新。`);
    }
  }
  
  // 處理盤後期貨資料查詢
  async function handleFuturesDataQuery(event) {
    const text = event.message.text.trim();
    let dateStr = await parseDateFromCommand(text, '期貨資料');
    
    if (!dateStr) {
      await event.reply('日期格式無效，請使用「期貨資料YYYYMMDD」格式。例如：期貨資料20250415');
      return;
    }
    
    // 查詢資料
    const futuresData = await findFuturesData(dateStr);
    
    if (futuresData) {
      // 如果返回的資料日期與查詢日期不同，提示用戶
      if (futuresData.date !== dateStr) {
        await event.reply(`找不到 ${dateStr} 的期貨資料，將顯示最近的交易日 ${futuresData.date} 的資料。`);
      }
      
      // 找到資料，構建訊息
      let message = `📊 台指期貨盤後資料 (${futuresData.date}) 📊\n\n`;
      
      // 台指期相關資料
      if (futuresData.txf) {
        const { txf } = futuresData;
        
        if (txf.price) {
          // 格式化台指期的漲跌
          const txfChangeSymbol = txf.change >= 0 ? '▲' : '▼';
          const txfChangeAbs = Math.abs(txf.change || 0).toFixed(0);
          const txfChangePercentFormatted = txf.changePercent 
            ? `(${txf.changePercent >= 0 ? '+' : ''}${txf.changePercent.toFixed(2)}%)`
            : '';
          
          message += `台指期(近): ${txf.price.toLocaleString('zh-TW')} `;
          message += `${txfChangeSymbol}${txfChangeAbs} ${txfChangePercentFormatted}\n`;
          
          // 若有基差資料
          if (txf.basis) {
            message += `價差: ${txf.basis.toFixed(2)}\n`;
          }
        }
        
        // 十大交易人淨部位
        if (txf.top10NetOI !== undefined) {
          message += `十大交易人淨部位: ${txf.top10NetOI.toLocaleString('zh-TW')}\n`;
        }
        
        // 市場總未平倉
        if (txf.marketOI) {
          message += `全市場未平倉: ${txf.marketOI.toLocaleString('zh-TW')}\n`;
        }
      }
      
      // PCR 比率
      if (futuresData.putCallRatio) {
        const { putCallRatio } = futuresData;
        
        message += `\n📊 選擇權 Put/Call 比率\n`;
        
        if (putCallRatio.volumeRatio !== undefined) {
          message += `成交量比率: ${putCallRatio.volumeRatio.toFixed(2)}%\n`;
        }
        
        if (putCallRatio.oiRatio !== undefined) {
          message += `未平倉比率: ${putCallRatio.oiRatio.toFixed(2)}%\n`;
        }
      }
      
      // 更新時間
      message += `\n資料更新時間: ${new Date(futuresData.lastUpdated).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`;
      
      await event.reply(message);
    } else {
      await event.reply(`找不到 ${dateStr} 的期貨資料，可能是非交易日或資料尚未更新。`);
    }
  }
  
  // 處理盤後籌碼快報查詢（三大法人買賣超）
  async function handleChipDataQuery(event) {
    const text = event.message.text.trim();
    let dateStr = await parseDateFromCommand(text, '籌碼快報');
    
    if (!dateStr) {
      await event.reply('日期格式無效，請使用「籌碼快報YYYYMMDD」格式。例如：籌碼快報20250415');
      return;
    }
    
    // 查詢資料
    const futuresData = await findFuturesData(dateStr);
    
    if (futuresData && futuresData.institutionalInvestors) {
      // 如果返回的資料日期與查詢日期不同，提示用戶
      if (futuresData.date !== dateStr) {
        await event.reply(`找不到 ${dateStr} 的籌碼資料，將顯示最近的交易日 ${futuresData.date} 的資料。`);
      }
      
      // 找到資料，構建訊息
      let message = `📊 三大法人買賣超籌碼快報 (${futuresData.date}) 📊\n\n`;
      
      const { institutionalInvestors } = futuresData;
      
      // 三大法人合計
      if (institutionalInvestors.totalNetBuySell !== undefined) {
        const totalSymbol = institutionalInvestors.totalNetBuySell >= 0 ? '+' : '';
        message += `三大法人合計: ${totalSymbol}${institutionalInvestors.totalNetBuySell.toFixed(2)} 億元\n\n`;
      }
      
      // 外資
      if (institutionalInvestors.foreign) {
        const foreign = institutionalInvestors.foreign;
        
        if (foreign.netBuySell !== undefined) {
          const foreignSymbol = foreign.netBuySell >= 0 ? '+' : '';
          message += `外資買賣超: ${foreignSymbol}${foreign.netBuySell.toFixed(2)} 億元\n`;
        }
        
        // 外資期貨
        if (foreign.txfOI !== undefined || foreign.mtxOI !== undefined) {
          message += `外資期貨未平倉:\n`;
          
          if (foreign.txfOI !== undefined) {
            message += `  台指期: ${foreign.txfOI.toLocaleString('zh-TW')} 口`;
            
            if (foreign.txfChange !== undefined) {
              const txfChangeSymbol = foreign.txfChange >= 0 ? '+' : '';
              message += ` (${txfChangeSymbol}${foreign.txfChange})`;
            }
            
            message += `\n`;
          }
          
          if (foreign.mtxOI !== undefined) {
            message += `  小台指: ${foreign.mtxOI.toLocaleString('zh-TW')} 口`;
            
            if (foreign.mtxChange !== undefined) {
              const mtxChangeSymbol = foreign.mtxChange >= 0 ? '+' : '';
              message += ` (${mtxChangeSymbol}${foreign.mtxChange})`;
            }
            
            message += `\n`;
          }
        }
      }
      
      // 投信
      if (institutionalInvestors.investment && institutionalInvestors.investment.netBuySell !== undefined) {
        const investment = institutionalInvestors.investment;
        const investmentSymbol = investment.netBuySell >= 0 ? '+' : '';
        message += `投信買賣超: ${investmentSymbol}${investment.netBuySell.toFixed(2)} 億元\n`;
      }
      
      // 自營商
      if (institutionalInvestors.dealer) {
        const dealer = institutionalInvestors.dealer;
        
        if (dealer.netBuySellTotal !== undefined) {
          const dealerTotalSymbol = dealer.netBuySellTotal >= 0 ? '+' : '';
          message += `自營商買賣超(合計): ${dealerTotalSymbol}${dealer.netBuySellTotal.toFixed(2)} 億元\n`;
        }
        
        if (dealer.netBuySellSelf !== undefined) {
          const dealerSelfSymbol = dealer.netBuySellSelf >= 0 ? '+' : '';
          message += `  自行買賣: ${dealerSelfSymbol}${dealer.netBuySellSelf.toFixed(2)} 億元\n`;
        }
        
        if (dealer.netBuySellHedge !== undefined) {
          const dealerHedgeSymbol = dealer.netBuySellHedge >= 0 ? '+' : '';
          message += `  避險: ${dealerHedgeSymbol}${dealer.netBuySellHedge.toFixed(2)} 億元\n`;
        }
      }
      
      // 更新時間
      message += `\n資料更新時間: ${new Date(futuresData.lastUpdated).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`;
      
      await event.reply(message);
    } else {
      await event.reply(`找不到 ${dateStr} 的籌碼資料，可能是非交易日或資料尚未更新。`);
    }
  }
  
  // 處理盤後整合資料查詢
  async function handleIntegratedDataQuery(event) {
    const text = event.message.text.trim();
    let dateStr = await parseDateFromCommand(text, '整合資料');
    
    if (!dateStr) {
      await event.reply('日期格式無效，請使用「整合資料YYYYMMDD」格式。例如：整合資料20250415');
      return;
    }
    
    // 直接使用查詢日期進行格式化
    // messages.js內部會處理找尋最近可用資料的邏輯
    const formattedMessage = await messages.formatIntegratedMarketDataMessage(dateStr);
    
    // 回覆訊息
    await event.reply(formattedMessage);
  }
  
  // 從命令中解析日期
  async function parseDateFromCommand(text, command) {
    if (text === command) {
      // 如果僅輸入指令，查詢最新資料
      return format(new Date(), 'yyyy-MM-dd');
    } else {
      // 從指令YYYYMMDD格式解析日期
      const datePattern = new RegExp(`${command}(\\d{8})`);
      const match = text.match(datePattern);
      
      if (match && match[1]) {
        // 解析 YYYYMMDD 格式
        const yearStr = match[1].substring(0, 4);
        const monthStr = match[1].substring(4, 6);
        const dayStr = match[1].substring(6, 8);
        
        // 驗證日期格式
        const inputDate = parse(`${yearStr}-${monthStr}-${dayStr}`, 'yyyy-MM-dd', new Date());
        
        if (isValid(inputDate)) {
          return format(inputDate, 'yyyy-MM-dd');
        }
      }
    }
    
    return null;
  }
  
  // 尋找市場資料（證交所）
  async function findMarketData(dateStr) {
    // 先直接查詢指定日期
    let specificData = await MarketData.findOne({ date: dateStr });
    
    if (specificData) {
      return specificData;
    }
    
    // 如果是查詢今天的資料，且資料庫中沒有，嘗試立即抓取
    const today = format(new Date(), 'yyyy-MM-dd');
    if (dateStr === today) {
      try {
        // 引入排程模組
        const scheduler = require('../scheduler/jobs');
        
        logger.info(`嘗試立即抓取 ${dateStr} 的證交所資料`);
        // 嘗試立即抓取資料
        await scheduler.checkAndUpdateMarketData();
        
        // 再次嘗試查詢今天的資料
        specificData = await MarketData.findOne({ date: dateStr });
        if (specificData) {
          logger.info(`成功獲取 ${dateStr} 的證交所資料`);
          return specificData;
        }
        
        // 如果還是沒找到當日資料，獲取最新資料
        const latestData = await MarketData.getLatest();
        if (latestData) {
          // 檢查最新資料是否為非當日資料
          if (latestData.date !== dateStr) {
            logger.info(`未找到 ${dateStr} 的證交所資料，將使用最新資料日期: ${latestData.date}`);
            // 將這視為有效的資料（可能是因為今天是非交易日或資料尚未更新）
            return latestData;
          }
        }
      } catch (error) {
        logger.error('立即抓取證交所資料時發生錯誤:', error);
      }
    } else {
      // 如果不是今天的資料，嘗試獲取之前最近的一天資料
      try {
        const prevData = await MarketData.findOne({ date: { $lt: dateStr } }).sort({ date: -1 });
        if (prevData) {
          logger.info(`未找到 ${dateStr} 的證交所資料，將使用前一個交易日: ${prevData.date}`);
          return prevData;
        }
      } catch (error) {
        logger.error(`查找 ${dateStr} 之前的證交所資料時發生錯誤:`, error);
      }
    }
    
    // 無論如何，如果找不到指定日期的資料，都返回最新的一筆資料
    const latestData = await MarketData.getLatest();
    if (latestData) {
      logger.info(`使用最新的證交所資料日期: ${latestData.date}`);
    } else {
      logger.warn('資料庫中沒有任何證交所資料');
    }
    return latestData;
  }
  
  // 尋找期貨市場資料（期交所）
  async function findFuturesData(dateStr) {
    // 先直接查詢指定日期
    let specificData = await FuturesMarketData.findOne({ date: dateStr });
    
    if (specificData) {
      return specificData;
    }
    
    // 如果是查詢今天的資料，且資料庫中沒有，嘗試立即抓取
    const today = format(new Date(), 'yyyy-MM-dd');
    if (dateStr === today) {
      try {
        // 引入排程模組
        const scheduler = require('../scheduler/jobs');
        
        logger.info(`嘗試立即抓取 ${dateStr} 的期交所資料`);
        // 嘗試立即抓取資料
        await scheduler.checkAndUpdateFuturesMarketData();
        
        // 再次嘗試查詢今天的資料
        specificData = await FuturesMarketData.findOne({ date: dateStr });
        if (specificData) {
          logger.info(`成功獲取 ${dateStr} 的期交所資料`);
          return specificData;
        }
        
        // 如果還是沒找到當日資料，獲取最新資料
        const latestData = await FuturesMarketData.getLatest();
        if (latestData) {
          // 檢查最新資料是否為非當日資料
          if (latestData.date !== dateStr) {
            logger.info(`未找到 ${dateStr} 的期交所資料，將使用最新資料日期: ${latestData.date}`);
            // 將這視為有效的資料（可能是因為今天是非交易日或資料尚未更新）
            return latestData;
          }
        }
      } catch (error) {
        logger.error('立即抓取期交所資料時發生錯誤:', error);
      }
    } else {
      // 如果不是今天的資料，嘗試獲取之前最近的一天資料
      try {
        const prevData = await FuturesMarketData.findOne({ date: { $lt: dateStr } }).sort({ date: -1 });
        if (prevData) {
          logger.info(`未找到 ${dateStr} 的期交所資料，將使用前一個交易日: ${prevData.date}`);
          return prevData;
        }
      } catch (error) {
        logger.error(`查找 ${dateStr} 之前的期交所資料時發生錯誤:`, error);
      }
    }
    
    // 無論如何，如果找不到指定日期的資料，都返回最新的一筆資料
    const latestData = await FuturesMarketData.getLatest();
    if (latestData) {
      logger.info(`使用最新的期交所資料日期: ${latestData.date}`);
    } else {
      logger.warn('資料庫中沒有任何期交所資料');
    }
    return latestData;
  }
};
