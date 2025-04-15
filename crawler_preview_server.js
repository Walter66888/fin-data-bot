/**
 * 爬蟲結果預覽伺服器 (增強版)
 * 提供網頁查看爬蟲結果，確認數據無誤，支援多種期交所資料
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const port = process.env.PORT || 3001;
const { spawn } = require('child_process');

// 設置靜態文件目錄
app.use('/data', express.static(path.join(__dirname, 'data')));

// 爬蟲類型配置
const crawlerTypes = {
  'pc_ratio': {
    name: '台指選擇權 Put/Call 比率',
    script: 'taifex_pc_ratio_crawler.py',
    importScript: 'import_taifex_data.js',
    importType: 'pcRatio',
    filePattern: /^pc_ratio.*\.json$/
  },
  'institutional': {
    name: '三大法人期貨淨部位',
    script: 'taifex_institutional_crawler.py',
    importScript: 'import_taifex_data.js',
    importType: 'institutional',
    filePattern: /^institutional.*\.json$/
  }
};

// 中間件：檢查數據目錄
app.use((req, res, next) => {
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  next();
});

// 路由：顯示所有可用的爬蟲數據文件
app.get('/', (req, res) => {
  try {
    const dataDir = path.join(__dirname, 'data');
    
    // 讀取所有文件
    let files = [];
    if (fs.existsSync(dataDir)) {
      files = fs.readdirSync(dataDir)
        .filter(file => file.endsWith('.json'))
        .sort((a, b) => {
          // 將最新的文件排在最前面
          return fs.statSync(path.join(dataDir, b)).mtime.getTime() - 
                fs.statSync(path.join(dataDir, a)).mtime.getTime();
        });
    }
    
    // 依照爬蟲類型分類文件
    const filesByType = {};
    for (const type in crawlerTypes) {
      filesByType[type] = files.filter(file => crawlerTypes[type].filePattern.test(file));
    }
    
    // 生成 HTML
    let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>期交所爬蟲結果預覽</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; line-height: 1.6; }
        h1 { color: #2c3e50; }
        h2 { color: #3498db; margin-top: 20px; }
        ul { list-style-type: none; padding: 0; }
        li { margin: 8px 0; }
        a { color: #2980b9; text-decoration: none; }
        a:hover { text-decoration: underline; }
        .file-item { display: flex; align-items: center; }
        .file-date { color: #7f8c8d; margin-left: 10px; font-size: 0.9em; }
        button {
          background-color: #3498db;
          border: none;
          color: white;
          padding: 10px 15px;
          margin: 5px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 1em;
        }
        button:hover { background-color: #2980b9; }
        .error { color: #e74c3c; }
        .success { color: #27ae60; }
        .spinner { display: inline-block; width: 20px; height: 20px; margin-left: 10px; animation: spin 1s linear infinite; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .loader { border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; width: 20px; height: 20px; }
        .controls { margin: 20px 0; padding: 15px; background-color: #f8f9fa; border-radius: 5px; }
      </style>
      <script>
        function showSpinner(id) {
          const btn = document.getElementById(id);
          const spinner = document.createElement('span');
          spinner.className = 'spinner';
          spinner.innerHTML = '<div class="loader"></div>';
          btn.disabled = true;
          btn.parentNode.appendChild(spinner);
        }
        
        // 當頁面加載完成後執行的函數
        document.addEventListener('DOMContentLoaded', function() {
          // 獲取 URL 參數中的狀態信息
          const urlParams = new URLSearchParams(window.location.search);
          const status = urlParams.get('status');
          const message = urlParams.get('message');
          
          if (status && message) {
            // 建立狀態提示元素
            const statusDiv = document.createElement('div');
            statusDiv.className = status === 'success' ? 'success' : 'error';
            statusDiv.textContent = decodeURIComponent(message);
            
            // 插入到頁面頂部
            const body = document.body;
            body.insertBefore(statusDiv, body.firstChild);
            
            // 5 秒後自動移除提示
            setTimeout(() => {
              statusDiv.style.display = 'none';
            }, 5000);
          }
        });
      </script>
    </head>
    <body>
      <h1>期交所爬蟲結果預覽伺服器</h1>
      <div class="controls">
        <h2>手動操作</h2>
    `;
    
    // 添加每種爬蟲的執行按鈕
    for (const type in crawlerTypes) {
      html += `
        <div>
          <button id="${type}_crawl_btn" onclick="showSpinner('${type}_crawl_btn'); location.href='/crawl/${type}'">
            執行${crawlerTypes[type].name}爬蟲
          </button>
          <button id="${type}_import_btn" onclick="showSpinner('${type}_import_btn'); location.href='/import/${type}'">
            導入${crawlerTypes[type].name}到資料庫
          </button>
        </div>
      `;
    }
    
    html += `
      </div>
    `;
    
    // 顯示各類型的文件
    for (const type in crawlerTypes) {
      const typeFiles = filesByType[type] || [];
      
      html += `<h2>${crawlerTypes[type].name}爬蟲數據文件</h2>`;
      
      if (typeFiles.length === 0) {
        html += `<p>未找到任何 ${crawlerTypes[type].name} 爬蟲數據文件</p>`;
      } else {
        html += '<ul>';
        
        typeFiles.forEach(file => {
          const stats = fs.statSync(path.join(dataDir, file));
          const fileMtime = stats.mtime.toLocaleString('zh-TW');
          
          html += `
          <li class="file-item">
            <a href="/preview/${file}">${file}</a> 
            <span class="file-date">(${fileMtime})</span> - 
            <a href="/data/${file}" target="_blank">下載 JSON</a>
          </li>`;
        });
        
        html += '</ul>';
      }
    }
    
    html += `
    </body>
    </html>
    `;
    
    res.send(html);
  } catch (error) {
    res.status(500).send(`發生錯誤：${error.message}`);
  }
});

// 路由：預覽特定爬蟲數據
app.get('/preview/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, 'data', filename);
    
    // 檢查文件是否存在
    if (!fs.existsSync(filePath)) {
      return res.status(404).send('文件不存在');
    }
    
    // 讀取 JSON 數據
    const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // 確定爬蟲類型
    let crawlerType = 'unknown';
    for (const type in crawlerTypes) {
      if (crawlerTypes[type].filePattern.test(filename)) {
        crawlerType = type;
        break;
      }
    }
    
    // 生成 HTML 表格
    let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>爬蟲數據預覽：${filename}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; line-height: 1.6; }
        h1 { color: #2c3e50; }
        h2 { color: #3498db; margin-top: 20px; }
        a { color: #2980b9; text-decoration: none; }
        a:hover { text-decoration: underline; }
        table { border-collapse: collapse; width: 100%; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; position: sticky; top: 0; }
        tr:nth-child(even) { background-color: #f9f9f9; }
        .actions { margin: 20px 0; }
        button {
          background-color: #3498db;
          border: none;
          color: white;
          padding: 10px 15px;
          margin: 5px;
          border-radius: 4px;
          cursor: pointer;
        }
        button:hover { background-color: #2980b9; }
        .type-badge {
          background-color: #e74c3c;
          color: white;
          padding: 2px 8px;
          border-radius: 10px;
          font-size: 0.8em;
        }
      </style>
    </head>
    <body>
      <h1>爬蟲數據預覽：${filename}</h1>
      <div class="type-badge">${crawlerTypes[crawlerType]?.name || '未知類型'}</div>
      <div class="actions">
        <a href="/">返回列表</a>
        <a href="/data/${filename}" target="_blank">下載 JSON</a>
        <button onclick="location.href='/import/${crawlerType}?file=${filename}'">導入到資料庫</button>
      </div>
    `;
    
    if (Array.isArray(jsonData) && jsonData.length > 0) {
      // 獲取所有可能的欄位
      const allKeys = new Set();
      jsonData.forEach(item => {
        Object.keys(item).forEach(key => allKeys.add(key));
      });
      const keys = Array.from(allKeys);
      
      // 創建表格
      html += '<table border="1" cellpadding="5" cellspacing="0">';
      
      // 表頭
      html += '<tr>';
      keys.forEach(key => {
        html += `<th>${key}</th>`;
      });
      html += '</tr>';
      
      // 資料行
      jsonData.forEach(item => {
        html += '<tr>';
        keys.forEach(key => {
          let value = item[key] !== undefined ? item[key] : '';
          
          // 如果是數字或日期欄位，嘗試格式化
          if (key.toLowerCase().includes('date')) {
            // 不做特殊處理，保持原始格式
          } else if (typeof value === 'number' || !isNaN(parseFloat(value))) {
            // 嘗試格式化數字
            try {
              const num = parseFloat(value);
              if (key.toLowerCase().includes('ratio') || key.toLowerCase().includes('percent')) {
                value = num.toFixed(2) + '%';
              } else if (num > 10000) {
                value = num.toLocaleString('zh-TW');  // 加上千分位
              }
            } catch (e) {
              // 忽略格式化錯誤
            }
          }
          
          html += `<td>${value}</td>`;
        });
        html += '</tr>';
      });
      
      html += '</table>';
    } else {
      html += '<p>數據為空或格式不正確</p>';
    }
    
    html += `
      </body>
      </html>
    `;
    
    res.send(html);
  } catch (error) {
    res.status(500).send(`發生錯誤：${error.message}`);
  }
});

// 路由：手動執行爬蟲
app.get('/crawl/:type', (req, res) => {
  try {
    const type = req.params.type;
    
    if (!crawlerTypes[type]) {
      return res.redirect('/?status=error&message=' + encodeURIComponent(`未知的爬蟲類型: ${type}`));
    }
    
    const { script } = crawlerTypes[type];
    
    // 執行 Python 爬蟲腳本
    const crawler = spawn('python', [script]);
    
    let output = '';
    
    crawler.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    crawler.stderr.on('data', (data) => {
      output += `錯誤: ${data.toString()}`;
    });
    
    crawler.on('close', (code) => {
      if (code === 0) {
        // 成功執行
        res.redirect('/?status=success&message=' + encodeURIComponent(`${crawlerTypes[type].name}爬蟲執行成功`));
      } else {
        // 執行失敗
        res.redirect('/?status=error&message=' + encodeURIComponent(`${crawlerTypes[type].name}爬蟲執行失敗 (代碼: ${code})`));
      }
    });
  } catch (error) {
    res.redirect('/?status=error&message=' + encodeURIComponent(`執行爬蟲時發生錯誤：${error.message}`));
  }
});

// 路由：手動導入到資料庫
app.get('/import/:type', (req, res) => {
  try {
    const type = req.params.type;
    const specificFile = req.query.file;
    
    if (!crawlerTypes[type]) {
      return res.redirect('/?status=error&message=' + encodeURIComponent(`未知的爬蟲類型: ${type}`));
    }
    
    const { importScript, importType } = crawlerTypes[type];
    
    // 設置導入命令參數
    const args = [importScript, `--type=${importType}`];
    
    // 如果指定了特定文件，添加文件參數
    if (specificFile) {
      args.push(`--file=data/${specificFile}`);
    }
    
    // 執行 Node.js 導入腳本
    const importer = spawn('node', args);
    
    let output = '';
    
    importer.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    importer.stderr.on('data', (data) => {
      output += `錯誤: ${data.toString()}`;
    });
    
    importer.on('close', (code) => {
      if (code === 0) {
        // 成功執行
        res.redirect('/?status=success&message=' + encodeURIComponent(`${crawlerTypes[type].name}資料導入成功`));
      } else {
        // 執行失敗
        res.redirect('/?status=error&message=' + encodeURIComponent(`${crawlerTypes[type].name}資料導入失敗 (代碼: ${code})`));
      }
    });
  } catch (error) {
    res.redirect('/?status=error&message=' + encodeURIComponent(`執行資料導入時發生錯誤：${error.message}`));
  }
});

// 啟動服務器
app.listen(port, () => {
  console.log(`爬蟲結果預覽服務器運行在 http://localhost:${port}`);
});
