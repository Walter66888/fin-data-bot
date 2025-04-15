import pandas as pd
import json
from datetime import datetime
import os
import logging
import requests

# 設定日誌
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('taifex_pc_ratio_crawler')

def crawl_pc_ratio():
    """
    爬取台指選擇權 Put/Call 比率資料
    """
    logger.info('開始爬取台指選擇權 Put/Call 比率資料')
    
    # 目標網址
    url = 'https://www.taifex.com.tw/cht/3/pcRatioExcel'
    
    try:
        # 使用 pandas 讀取 HTML 表格
        tables = pd.read_html(url, encoding='utf-8')
        
        # 取得主要資料表（通常是第一個表格）
        if len(tables) > 0:
            df = tables[0]
            logger.info(f'成功讀取表格，共 {len(df)} 筆資料')
            
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
            
            # 重命名欄位
            df = df.rename(columns=columns_mapping)
            
            # 將 DataFrame 轉換為字典列表
            data = df.to_dict('records')
            
            # 日期格式轉換（處理中華民國年份格式）
            for item in data:
                # 如果日期是中文格式（如：112/04/15），轉換為西元年格式
                if '/' in str(item['Date']):
                    date_parts = str(item['Date']).split('/')
                    if len(date_parts) == 3:
                        roc_year = int(date_parts[0])
                        western_year = roc_year + 1911
                        item['Date'] = f"{western_year}/{date_parts[1]}/{date_parts[2]}"
            
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
            
            logger.info(f'數據已保存至 {output_file} 和 {latest_file}')
            return output_file
        else:
            logger.error('未找到資料表')
            return None
    except Exception as e:
        logger.error(f'爬取資料時發生錯誤: {str(e)}')
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
    else:
        logger.error('爬蟲程序失敗')
