const D1Manager = require('./D1Manager');

// 建立 D1 管理器實例
const db = new D1Manager();

// 範例 1: 查詢所有 user 記錄
async function getAllUsers() {
  console.log('📋 查詢所有使用者...');
  try {
    const users = await db.selectAll('user');
    console.log(`找到 ${users.length} 筆記錄:`);
    console.table(users);
  } catch (error) {
    console.error('❌ 查詢失敗:', error.message);
  }
}

// 範例 2: 查詢最近 10 筆記錄
async function getRecentUsers() {
  console.log('\n📋 查詢最近 10 筆記錄...');
  try {
    const sql = 'SELECT * FROM user ORDER BY created_time DESC LIMIT ?';
    const result = await db.query(sql, [10]);
    const users = result.result[0]?.results || [];
    console.table(users);
  } catch (error) {
    console.error('❌ 查詢失敗:', error.message);
  }
}

// 範例 3: 插入新記錄
async function insertUser() {
  console.log('\n➕ 插入新使用者...');
  try {
    const newUser = {
      token: 'test-token-' + Date.now(),
      created_time: new Date().toISOString()
    };

    const result = await db.insert('user', newUser);
    console.log('✅ 插入成功:', result);
  } catch (error) {
    console.error('❌ 插入失敗:', error.message);
  }
}

// 範例 4: 根據 token 查詢
async function getUserByToken(token) {
  console.log(`\n🔍 查詢 token: ${token}`);
  try {
    const users = await db.selectWhere('user', 'token = ?', [token]);
    if (users.length > 0) {
      console.log('✅ 找到記錄:');
      console.table(users);
    } else {
      console.log('⚠️  未找到記錄');
    }
  } catch (error) {
    console.error('❌ 查詢失敗:', error.message);
  }
}

// 範例 5: 更新記錄
async function updateUserEnterTime(token) {
  console.log(`\n🔄 更新 token 的 enter_time: ${token}`);
  try {
    const result = await db.update(
      'user',
      { enter_time: new Date().toISOString() },
      'token = ?',
      [token]
    );
    console.log('✅ 更新成功:', result);
  } catch (error) {
    console.error('❌ 更新失敗:', error.message);
  }
}

// 範例 6: 統計記錄數
async function countUsers() {
  console.log('\n📊 統計記錄數...');
  try {
    const total = await db.count('user');
    console.log(`✅ 總共有 ${total} 筆記錄`);
  } catch (error) {
    console.error('❌ 統計失敗:', error.message);
  }
}

// 範例 7: 刪除舊記錄 (超過 30 天)
async function deleteOldUsers() {
  console.log('\n🗑️  刪除 30 天前的記錄...');
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await db.delete(
      'user',
      'created_time < ?',
      [thirtyDaysAgo.toISOString()]
    );
    console.log('✅ 刪除完成:', result);
  } catch (error) {
    console.error('❌ 刪除失敗:', error.message);
  }
}

// 範例 8: 自訂 SQL 查詢
async function customQuery() {
  console.log('\n🔧 執行自訂查詢...');
  try {
    const sql = `
      SELECT
        DATE(created_time) as date,
        COUNT(*) as count
      FROM user
      GROUP BY DATE(created_time)
      ORDER BY date DESC
      LIMIT 7
    `;

    const result = await db.query(sql);
    const stats = result.result[0]?.results || [];
    console.log('📊 最近 7 天的統計:');
    console.table(stats);
  } catch (error) {
    console.error('❌ 查詢失敗:', error.message);
  }
}

// 主函數 - 執行所有範例
async function main() {
  console.log('🚀 Cloudflare D1 資料庫管理範例\n');
  console.log('=' .repeat(50));

  // 執行範例
  await countUsers();
  await getAllUsers();
  await getRecentUsers();

  // 如果你想測試插入、更新、刪除，取消註解以下程式碼
  // await insertUser();
  // await getUserByToken('test-token-123');
  // await updateUserEnterTime('test-token-123');
  // await deleteOldUsers();
  // await customQuery();

  console.log('\n' + '='.repeat(50));
  console.log('✅ 所有操作完成！');
}

// 執行主函數
main().catch(error => {
  console.error('❌ 程式執行錯誤:', error);
  process.exit(1);
});
