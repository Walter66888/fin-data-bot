/**
 * 爬蟲結果預覽伺服器
 * 提供網頁查看爬蟲結果，確認數據無誤
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const port = process.env.PORT || 3001;

// 設置靜態文件目錄
app.use('/data', express.static(path.join(__dirname, 'data')));

// 路由：顯示所有可用的爬蟲數據文件
app.get('/', (req, res) => {
  try {
    const dataDir = path.join(__dirname, 'data');
    
    // 檢查目錄是否存在
    if (!fs.existsSync(dataDir)) {
      return res.send('數據目錄不存在，請先執行爬蟲腳本');
    }
    
    // 讀取所有文件
    const files = fs.readdirSync(dataDir)
      .filter(file => file.endsWith('.json'))
      .sort((a, b) => {
        // 將最新的文件排在最前面
        return fs.statSync(path.join(dataDir, b)).mtime.getTime() - 
               fs.statSync(path.join(dataDir, a)).mtime.getTime();
      });
    
    if (files.length === 0) {
      return res.send('未找到任何爬蟲數據文件');
    }
    
    // 生成 HTML 列表
    let html = '<h1>爬蟲數據文件列表</h1><ul>';
    
    files.forEach(file => {
      html += `<li><a href="/preview/${file}">${file}</a> - <a href="/data/${file}" target="_blank">下載 JSON</a></li>`;
    });
    
    html += '</ul>';
    
    // 添加手動觸發爬蟲的按鈕
    html += `
      <h2>手動操作</h2>
      <button onclick="location.href='/crawl'">手動執行爬蟲</button>
      <button onclick="location.href='/import'">導入到資料庫</button>
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
    
    // 生成 HTML 表格
    let html = `<h1>爬蟲數據預覽：${filename}</h1>`;
    html += '<a href="/">返回列表</a><br><br>';
    
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
          html += `<td>${item[key] !== undefined ? item[key] : ''}</td>`;
        });
        html += '</tr>';
      });
      
      html += '</table>';
    } else {
      html += '<p>數據為空或格式不正確</p>';
    }
    
    res.send(html);
  } catch (error) {
    res.status(500).send(`發生錯誤：${error.message}`);
  }
});

// 路由：手動執行爬蟲
app.get('/crawl', (req, res) => {
  try {
    const { spawn } = require('child_process');
    
    // 執行 Python 爬蟲腳本
    const crawler = spawn('python', ['taifex_pc_ratio_crawler.py']);
    
    let output = '';
    
    crawler.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    crawler.stderr.on('data', (data) => {
      output += `錯誤: ${data.toString()}`;
    });
    
    crawler.on('close', (code) => {
      if (code === 0) {
        res.send(`<h1>爬蟲執行成功</h1><pre>${output}</pre><a href="/">返回列表</a>`);
      } else {
        res.status(500).send(`<h1>爬蟲執行失敗 (代碼: ${code})</h1><pre>${output}</pre><a href="/">返回列表</a>`);
      }
    });
  } catch (error) {
    res.status(500).send(`執行爬蟲時發生錯誤：${error.message}<br><a href="/">返回列表</a>`);
  }
});

// 路由：手動導入到資料庫
app.get('/import', (req, res) => {
  try {
    const { spawn } = require('child_process');
    
    // 執行 Node.js 導入腳本
    const importer = spawn('node', ['import_taifex_data.js']);
    
    let output = '';
    
    importer.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    importer.stderr.on('data', (data) => {
      output += `錯誤: ${data.toString()}`;
    });
    
    importer.on('close', (code) => {
      if (code === 0) {
        res.send(`<h1>資料導入成功</h1><pre>${output}</pre><a href="/">返回列表</a>`);
      } else {
        res.status(500).send(`<h1>資料導入失敗 (代碼: ${code})</h1><pre>${output}</pre><a href="/">返回列表</a>`);
      }
    });
  } catch (error) {
    res.status(500).send(`執行資料導入時發生錯誤：${error.message}<br><a href="/">返回列表</a>`);
  }
});

// 啟動服務器
app.listen(port, () => {
  console.log(`爬蟲結果預覽服務器運行在 http://localhost:${port}`);
});
