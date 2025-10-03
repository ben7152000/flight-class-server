const D1Manager = require('./D1Manager');

const db = new D1Manager();

async function testInsert() {
  console.log('🧪 測試插入資料到 D1 資料庫\n');

  try {
    // 插入測試資料
    console.log('➕ 插入新記錄...');
    const newUser = {
      token: 'test-token-' + Date.now(),
      created_time: new Date().toISOString()
    };

    const insertResult = await db.insert('user', newUser);
    console.log('✅ 插入成功!');
    console.log('插入的資料:', newUser);
    console.log('API 回應:', insertResult);

    // 查詢所有記錄
    console.log('\n📋 查詢所有記錄...');
    const allUsers = await db.selectAll('user');
    console.log(`找到 ${allUsers.length} 筆記錄:`);
    console.table(allUsers);

    // 統計記錄數
    const count = await db.count('user');
    console.log(`\n📊 資料庫總共有 ${count} 筆記錄`);

  } catch (error) {
    console.error('❌ 錯誤:', error.message);
  }
}

testInsert();
