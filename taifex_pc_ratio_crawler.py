import pandas as pd
import json
from datetime import datetime
import os
import logging
import requests
import re

# 設定日誌
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('taifex_pc_ratio_crawler')

def crawl_pc_ratio():
    """
    爬取台指選擇權 Put/Call 比率資料
    參考原始 TaifexScraper.fetchTxoPutCallRatio 方法
    """
    logger.info('開始爬取台指選擇權 Put/Call 比率資料')
    
    try:
        # 取得當天日期作為查詢參數
        today = datetime.now().strftime('%Y/%m/%d')
        
        # 準備請求參數，模仿原始 TaifexScraper 中的參數設置
        form_data = {
            'queryStartDate': today,
            'queryEndDate': today
        }
        
        # 使用 pandas 讀取 HTML 表格
        url = 'https://www.taifex.com.tw/cht/3/pcRatioExcel'
        logger.info(f'正在請求資料，URL: {url}, 參數: {form_data}')
        
        # 使用 pandas 的 read_html 函數讀取 HTML 表格
        tables = pd.read_html(url, encoding='utf-8')
        
        # 取得主要資料表（通常是第一個表格）
        if len(tables) > 0:
            df = tables[0]
            logger.info(f'成功讀取表格，共 {len(df)} 筆資料')
            
            # 顯示表格的列名，以便診斷
            logger.info(f'表格欄位: {df.columns.tolist()}')
            
            # 轉換欄位名稱為英文，與現有模型對應
            columns_mapping = {
                '日期': 'Date',
                '買權成交量': 'CallVolume',
                '賣權成交量': 'PutVolume',
                '買賣權成交量比率%': 'PutCallVolumeRatio%',
                '買權未平倉量': 'CallOI',
                '賣權未平倉量': 'PutOI',
                '買賣權未平倉量比率%': 'PutCallOIRatio%'
            }
            
            # 檢查列名是否在表格中
            for ch_col, en_col in columns_mapping.items():
                if ch_col not in df.columns:
                    logger.warning(f'欄位 {ch_col} 不在表格中，可用欄位: {df.columns.tolist()}')
            
            # 重命名欄位
            df = df.rename(columns=columns_mapping)
            
            # 將 DataFrame 轉換為字典列表
            data = df.to_dict('records')
            
            # 日期格式轉換（處理中華民國年份格式）
            for item in data:
                # 如果日期是中文格式（如：112/04/15），轉換為西元年格式
                if isinstance(item['Date'], str) and '/' in item['Date']:
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
                for key in ['CallVolume', 'PutVolume', 'CallOI', 'PutOI']:
                    if key in item and isinstance(item[key], str):
                        # 刪除千分位逗號
                        item[key] = item[key].replace(',', '')
                
                # 處理百分比欄位
                for key in ['PutCallVolumeRatio%', 'PutCallOIRatio%']:
                    if key in item and isinstance(item[key], str):
                        # 刪除千分位逗號和百分比符號
                        value = item[key].replace(',', '').replace('%', '')
                        try:
                            item[key] = value
                        except ValueError:
                            logger.warning(f"無法解析百分比: {item[key]}")
            
            # 打印前 3 筆資料以便於檢查格式
            logger.info("抽樣資料（前3筆）:")
            for i, row in enumerate(data[:3]):
                logger.info(f"資料 {i+1}: {row}")
            
            # 生成時間戳作為檔案名的一部分
            timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
            
            # 確保目錄存在
            os.makedirs('data', exist_ok=True)
            
            # 將數據保存為 JSON
            output_file = f'data/pc_ratio_{timestamp}.json'
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            
            # 同時保存最新的檔案（固定名稱）供直接讀取
            latest_file = 'data/pc_ratio_latest.json'
            with open(latest_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            
            # 輸出摘要資訊到日誌
            if len(data) > 0:
                logger.info(f'爬取到的最新資料日期: {data[0]["Date"]}')
                logger.info(f'買權成交量: {data[0]["CallVolume"]}')
                logger.info(f'賣權成交量: {data[0]["PutVolume"]}')
                logger.info(f'成交量比率: {data[0]["PutCallVolumeRatio%"]}')
                logger.info(f'買權未平倉量: {data[0]["CallOI"]}')
                logger.info(f'賣權未平倉量: {data[0]["PutOI"]}')
                logger.info(f'未平倉量比率: {data[0]["PutCallOIRatio%"]}')
            
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

# 檢查之前的資料並決定是否進行爬蟲
def check_and_crawl():
    """
    檢查既有資料，如果沒有資料或資料過期，則進行爬蟲
    """
    need_crawl = True
    
    # 檢查最新數據文件是否存在
    latest_file = 'data/pc_ratio_latest.json'
    if os.path.exists(latest_file):
        try:
            # 讀取最新數據
            with open(latest_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            if data and len(data) > 0:
                # 檢查資料日期是否為今天
                latest_date = data[0]['Date']
                today = datetime.now().strftime('%Y/%m/%d')
                
                logger.info(f'既有資料日期: {latest_date}, 今日日期: {today}')
                
                # 如果最新資料日期是今天，則不需要爬蟲
                if latest_date == today:
                    logger.info(f'已有今日 ({today}) 的資料，不需要重新爬取')
                    need_crawl = False
                else:
                    logger.info(f'最新資料日期 ({latest_date}) 不是今天 ({today})，將重新爬取')
        except Exception as e:
            logger.error(f'檢查既有資料時發生錯誤: {str(e)}')
    else:
        logger.info('找不到既有資料，將進行首次爬取')
    
    # 如果需要爬蟲，執行爬蟲
    if need_crawl:
        return crawl_pc_ratio()
    return latest_file

if __name__ == '__main__':
    output_file = check_and_crawl()
    if output_file:
        logger.info(f'爬蟲程序完成，數據已保存至 {output_file}')
        print(f'RESULT_FILE={output_file}')  # 輸出結果檔案路徑供 GitHub Actions 使用
    else:
        logger.error('爬蟲程序失敗')
        exit(1)  # 非零退出碼表示失敗
