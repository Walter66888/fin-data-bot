import pandas as pd
import json
from datetime import datetime
import os
import logging
import requests
import io

# 設定日誌
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('taifex_institutional_crawler')

def crawl_institutional_data():
    """
    爬取三大法人期貨淨部位資料
    參考原始 TaifexScraper.fetchFuturesInstitutional 方法
    """
    logger.info('開始爬取三大法人期貨淨部位資料')
    
    try:
        # 取得當天日期作為查詢參數
        today = datetime.now().strftime('%Y/%m/%d')
        
        # 準備請求參數，模仿原始 TaifexScraper 中的參數設置
        form_data = {
            'queryStartDate': today,
            'queryEndDate': today,
            'commodityId': 'TXF' # 台指期貨
        }
        
        # 直接發送請求獲取資料，使用與原始 TaifexScraper 相似的方式
        url = 'https://www.taifex.com.tw/cht/3/futContractsDateExcel'
        logger.info(f'正在請求資料，URL: {url}, 參數: {form_data}')
        
        # 使用 pandas 的 read_html 函數讀取 HTML 表格
        tables = pd.read_html(url, encoding='utf-8')
        
        # 取得主要資料表
        if len(tables) > 0:
            df = tables[0]
            logger.info(f'成功讀取表格，共 {len(df)} 筆資料')
            
            # 顯示表格的列名，以便診斷
            logger.info(f'表格欄位: {df.columns.tolist()}')
            
            # 轉換欄位名稱為英文，與原本模型對應
            columns_mapping = {
                '日期': 'Date',
                '身份別': 'InvestorType',
                '多方交易口數': 'LongTradeVolume',
                '多方交易契約金額(千元)': 'LongTradeValue',
                '空方交易口數': 'ShortTradeVolume',
                '空方交易契約金額(千元)': 'ShortTradeValue',
                '多空交易口數淨額': 'NetTradeVolume',
                '多空交易契約金額淨額(千元)': 'NetTradeValue',
                '多方未平倉口數': 'LongOIVolume',
                '多方未平倉契約金額(千元)': 'LongOIValue',
                '空方未平倉口數': 'ShortOIVolume',
                '空方未平倉契約金額(千元)': 'ShortOIValue',
                '多空未平倉口數淨額': 'NetOIVolume',
                '多空未平倉契約金額淨額(千元)': 'NetOIValue',
                '契約': 'Contract'
            }
            
            # 檢查列名是否在表格中
            for ch_col, en_col in columns_mapping.items():
                if ch_col not in df.columns:
                    logger.warning(f'欄位 {ch_col} 不在表格中')
            
            # 重命名欄位 (只重命名存在的欄位)
            for ch_col, en_col in columns_mapping.items():
                if ch_col in df.columns:
                    df = df.rename(columns={ch_col: en_col})
            
            # 標準化商品名稱
            if 'Contract' in df.columns:
                df['ContractName'] = df['Contract'].apply(lambda x: x.split(' ')[0] if isinstance(x, str) else x)
            
            # 過濾出台指期貨數據
            tx_df = df[df['ContractName'] == '臺股期貨']
            
            if len(tx_df) > 0:
                logger.info(f'找到臺股期貨資料，共 {len(tx_df)} 筆')
            else:
                logger.warning('找不到臺股期貨資料')
                # 檢查所有不同的商品類型
                if 'ContractName' in df.columns:
                    unique_contracts = df['ContractName'].unique()
                    logger.info(f'可用的商品類型: {unique_contracts}')
                    # 若找不到臺股期貨，使用原始 DataFrame
                    tx_df = df
            
            # 將 DataFrame 轉換為字典列表
            data = tx_df.to_dict('records')
            
            # 日期格式轉換（處理中華民國年份格式）
            for item in data:
                if 'Date' in item and isinstance(item['Date'], str) and '/' in item['Date']:
                    date_parts = item['Date'].split('/')
                    if len(date_parts) == 3:
                        try:
                            roc_year = int(date_parts[0])
                            # 中華民國年份轉西元年
                            if roc_year < 1911:
                                western_year = roc_year + 1911
                                item['Date'] = f"{western_year}/{date_parts[1]}/{date_parts[2]}"
                        except ValueError:
                            logger.warning(f"無法解析日期: {item['Date']}")
                
                # 確保數值欄位正確處理
                for key in ['LongTradeVolume', 'ShortTradeVolume', 'NetTradeVolume', 
                           'LongOIVolume', 'ShortOIVolume', 'NetOIVolume']:
                    if key in item and isinstance(item[key], str):
                        try:
                            # 刪除千分位逗號
                            item[key] = item[key].replace(',', '')
                        except AttributeError:
                            # 如果不是字串，保持原值
                            pass
                
                # 處理金額欄位
                for key in ['LongTradeValue', 'ShortTradeValue', 'NetTradeValue',
                           'LongOIValue', 'ShortOIValue', 'NetOIValue']:
                    if key in item and isinstance(item[key], str):
                        try:
                            # 刪除千分位逗號
                            item[key] = item[key].replace(',', '')
                        except AttributeError:
                            # 如果不是字串，保持原值
                            pass
            
            # 打印前 3 筆資料以便於檢查格式
            logger.info("抽樣資料（前3筆）:")
            for i, row in enumerate(data[:3]):
                logger.info(f"資料 {i+1}: {row}")
            
            # 生成時間戳作為檔案名的一部分
            timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
            
            # 確保目錄存在
            os.makedirs('data', exist_ok=True)
            
            # 將數據保存為 JSON
            output_file = f'data/institutional_{timestamp}.json'
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            
            # 同時保存最新的檔案（固定名稱）供直接讀取
            latest_file = 'data/institutional_latest.json'
            with open(latest_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            
            logger.info(f'數據已保存至 {output_file} 和 {latest_file}')
            return output_file
        else:
            logger.error('未找到資料表')
            return None
    except Exception as e:
        logger.error(f'爬取資料時發生錯誤: {str(e)}')
        import traceback
        logger.error(traceback.format_exc())
        return None

# 嘗試下載 CSV 格式的資料
def download_csv_data():
    """
    嘗試直接下載 CSV 資料
    參考原始 TaifexScraper 使用 csvtojson 的方式
    """
    logger.info('嘗試直接下載 CSV 格式的三大法人期貨淨部位資料')
    
    try:
        # 取得當天日期作為查詢參數
        today = datetime.now().strftime('%Y/%m/%d')
        
        # 準備請求參數，模仿原始 TaifexScraper 中的下載 CSV 的方式
        form_data = {
            'queryStartDate': today,
            'queryEndDate': today,
            'commodityId': 'TXF'  # 台指期貨
        }
        
        # 發送請求獲取 CSV 資料
        url = 'https://www.taifex.com.tw/cht/3/futContractsDateDown'
        logger.info(f'正在請求 CSV 資料，URL: {url}, 參數: {form_data}')
        
        response = requests.post(url, data=form_data)
        response.raise_for_status()
        
        # 檢查回應是否包含查無資料的訊息
        if b'\xb7j\xb5L\xb8\xea\xae\xc6' in response.content:  # 查無資料的 Big5 編碼
            logger.warning('期交所回應查無資料')
            return None
        
        if b'\xa6\xdc\xb8\xb9\xae\xc9\xb6\xa1\xc3\xf8\xbf\xf2' in response.content:  # 日期時間錯誤的 Big5 編碼
            logger.warning('期交所回應日期時間錯誤')
            return None
        
        # 解碼為 Big5 編碼的文本
        csv_content = response.content.decode('big5', errors='ignore')
        
        # 使用 pandas 讀取 CSV 內容
        df = pd.read_csv(io.StringIO(csv_content))
        
        # 顯示表格的列名
        logger.info(f'CSV 欄位: {df.columns.tolist()}')
        
        # 將 DataFrame 轉換為字典列表
        data = df.to_dict('records')
        
        # 打印前 3 筆資料以便於檢查格式
        logger.info("CSV 抽樣資料（前3筆）:")
        for i, row in enumerate(data[:3]):
            logger.info(f"資料 {i+1}: {row}")
        
        # 生成時間戳作為檔案名的一部分
        timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
        
        # 確保目錄存在
        os.makedirs('data', exist_ok=True)
        
        # 將數據保存為 JSON
        output_file = f'data/institutional_csv_{timestamp}.json'
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        # 同時保存 CSV 原始內容，以便分析問題
        csv_file = f'data/institutional_raw_{timestamp}.csv'
        with open(csv_file, 'w', encoding='utf-8') as f:
            f.write(csv_content)
        
        logger.info(f'CSV 資料已保存至 {output_file} 和 {csv_file}')
        return output_file
    except Exception as e:
        logger.error(f'下載 CSV 資料時發生錯誤: {str(e)}')
        import traceback
        logger.error(traceback.format_exc())
        return None

# 檢查之前的資料並決定是否進行爬蟲
def check_and_crawl():
    """
    檢查既有資料，如果沒有資料或資料過期，則進行爬蟲
    """
    need_crawl = True
    
    # 檢查最新數據文件是否存在
    latest_file = 'data/institutional_latest.json'
    if os.path.exists(latest_file):
        try:
            # 讀取最新數據
            with open(latest_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            if data and len(data) > 0:
                # 尋找最新日期
                latest_date = None
                for item in data:
                    if 'Date' in item and item['Date']:
                        if latest_date is None or item['Date'] > latest_date:
                            latest_date = item['Date']
                
                if latest_date:
                    today = datetime.now().strftime('%Y/%m/%d')
                    
                    logger.info(f'既有資料日期: {latest_date}, 今日日期: {today}')
                    
                    # 如果最新資料日期是今天，則不需要爬蟲
                    if latest_date == today:
                        logger.info(f'已有今日 ({today}) 的資料，不需要重新爬取')
                        need_crawl = False
                    else:
                        logger.info(f'最新資料日期 ({latest_date}) 不是今天 ({today})，將重新爬取')
                else:
                    logger.warning('無法從既有資料中找到日期')
        except Exception as e:
            logger.error(f'檢查既有資料時發生錯誤: {str(e)}')
    else:
        logger.info('找不到既有資料，將進行首次爬取')
    
    # 如果需要爬蟲，執行爬蟲
    if need_crawl:
        # 優先使用 HTML 表格爬取方式
        result = crawl_institutional_data()
        if result is None:
            # 如果 HTML 表格爬取失敗，嘗試直接下載 CSV
            logger.info('HTML 表格爬取失敗，嘗試直接下載 CSV 資料')
            result = download_csv_data()
        return result
    return latest_file

if __name__ == '__main__':
    output_file = check_and_crawl()
    if output_file:
        logger.info(f'爬蟲程序完成，數據已保存至 {output_file}')
        print(f'RESULT_FILE={output_file}')  # 輸出結果檔案路徑供 GitHub Actions 使用
    else:
        logger.error('爬蟲程序失敗')
        exit(1)  # 非零退出碼表示失敗
