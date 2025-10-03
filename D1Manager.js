const fetch = require('node-fetch');
require('dotenv').config();

class D1Manager {
  constructor() {
    this.accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    this.databaseId = process.env.CLOUDFLARE_DATABASE_ID;
    this.apiToken = process.env.CLOUDFLARE_API_TOKEN;
    this.baseUrl = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/d1/database/${this.databaseId}/query`;
  }

  /**
   * 執行 SQL 查詢
   * @param {string} sql - SQL 查詢語句
   * @param {Array} params - 參數化查詢的參數 (可選)
   * @returns {Promise<Object>} - 查詢結果
   */
  async query(sql, params = []) {
    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sql: sql,
          params: params
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(`API Error: ${JSON.stringify(data)}`);
      }

      return data;
    } catch (error) {
      console.error('Query Error:', error.message);
      throw error;
    }
  }

  /**
   * 查詢所有記錄
   * @param {string} table - 資料表名稱
   * @param {number} limit - 限制筆數 (可選)
   * @returns {Promise<Array>} - 查詢結果
   */
  async selectAll(table, limit = null) {
    const sql = limit
      ? `SELECT * FROM ${table} LIMIT ?`
      : `SELECT * FROM ${table}`;
    const params = limit ? [limit] : [];

    const result = await this.query(sql, params);
    return result.result[0]?.results || [];
  }

  /**
   * 根據條件查詢
   * @param {string} table - 資料表名稱
   * @param {string} whereClause - WHERE 子句 (例如: "id = ?")
   * @param {Array} params - 參數
   * @returns {Promise<Array>} - 查詢結果
   */
  async selectWhere(table, whereClause, params = []) {
    const sql = `SELECT * FROM ${table} WHERE ${whereClause}`;
    const result = await this.query(sql, params);
    return result.result[0]?.results || [];
  }

  /**
   * 插入資料
   * @param {string} table - 資料表名稱
   * @param {Object} data - 要插入的資料 (鍵值對)
   * @returns {Promise<Object>} - 插入結果
   */
  async insert(table, data) {
    const columns = Object.keys(data).join(', ');
    const placeholders = Object.keys(data).map(() => '?').join(', ');
    const values = Object.values(data);

    const sql = `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`;
    return await this.query(sql, values);
  }

  /**
   * 更新資料
   * @param {string} table - 資料表名稱
   * @param {Object} data - 要更新的資料
   * @param {string} whereClause - WHERE 子句
   * @param {Array} whereParams - WHERE 參數
   * @returns {Promise<Object>} - 更新結果
   */
  async update(table, data, whereClause, whereParams = []) {
    const setClause = Object.keys(data).map(key => `${key} = ?`).join(', ');
    const values = [...Object.values(data), ...whereParams];

    const sql = `UPDATE ${table} SET ${setClause} WHERE ${whereClause}`;
    return await this.query(sql, values);
  }

  /**
   * 刪除資料
   * @param {string} table - 資料表名稱
   * @param {string} whereClause - WHERE 子句
   * @param {Array} params - 參數
   * @returns {Promise<Object>} - 刪除結果
   */
  async delete(table, whereClause, params = []) {
    const sql = `DELETE FROM ${table} WHERE ${whereClause}`;
    return await this.query(sql, params);
  }

  /**
   * 統計記錄數
   * @param {string} table - 資料表名稱
   * @param {string} whereClause - WHERE 子句 (可選)
   * @param {Array} params - 參數 (可選)
   * @returns {Promise<number>} - 記錄數
   */
  async count(table, whereClause = null, params = []) {
    const sql = whereClause
      ? `SELECT COUNT(*) as count FROM ${table} WHERE ${whereClause}`
      : `SELECT COUNT(*) as count FROM ${table}`;

    const result = await this.query(sql, params);
    return result.result[0]?.results[0]?.count || 0;
  }
}

module.exports = D1Manager;
