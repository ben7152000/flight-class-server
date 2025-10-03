# Cloudflare D1 資料庫管理工具

這是一個使用 Node.js 操作 Cloudflare D1 資料庫的專案，提供簡單易用的 API 來管理 D1 資料庫。

## 📦 安裝

```bash
npm install
```

## ⚙️ 設定

在專案根目錄建立 `.env` 檔案（已包含）：

```env
CLOUDFLARE_ACCOUNT_ID=your_account_id
CLOUDFLARE_DATABASE_ID=your_database_id
CLOUDFLARE_API_TOKEN=your_api_token
```

## 🚀 使用方式

### 執行範例程式

```bash
node examples.js
```

### 在你的程式中使用

```javascript
const D1Manager = require('./D1Manager');
const db = new D1Manager();

// 查詢所有記錄
const users = await db.selectAll('user');

// 插入記錄
await db.insert('user', {
  token: 'abc123',
  created_time: new Date().toISOString()
});

// 更新記錄
await db.update(
  'user',
  { enter_time: new Date().toISOString() },
  'token = ?',
  ['abc123']
);

// 刪除記錄
await db.delete('user', 'token = ?', ['abc123']);

// 統計記錄數
const count = await db.count('user');

// 自訂 SQL 查詢
const result = await db.query('SELECT * FROM user WHERE id = ?', [1]);
```

## 📚 API 方法

### `query(sql, params)`
執行自訂 SQL 查詢

### `selectAll(table, limit)`
查詢所有記錄

### `selectWhere(table, whereClause, params)`
根據條件查詢

### `insert(table, data)`
插入資料

### `update(table, data, whereClause, whereParams)`
更新資料

### `delete(table, whereClause, params)`
刪除資料

### `count(table, whereClause, params)`
統計記錄數

## 🗃️ 資料表結構

### user table

| 欄位 | 類型 | 說明 |
|------|------|------|
| id | INTEGER | 主鍵（自動增長）|
| token | TEXT | Token（唯一）|
| created_time | TEXT | 建立時間 |
| enter_time | TEXT | 進入時間（可選）|
| expired_time | TEXT | 過期時間（可選）|

## 📝 範例

查看 `examples.js` 檔案以了解更多使用範例。

## 🔒 安全性

- 請勿將 `.env` 檔案提交到版本控制系統
- API Token 應妥善保管
- 使用參數化查詢防止 SQL 注入

## 📄 授權

ISC
