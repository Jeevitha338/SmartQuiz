const fs = require('fs');
const path = require('path');
const { saveToExcel } = require('../utils/excel');

const USERS_FILE = path.join(__dirname, '../mem_users.json');

if (fs.existsSync(USERS_FILE)) {
    console.log("Loading existing users...");
    const users = JSON.parse(fs.readFileSync(USERS_FILE));
    console.log(`Loaded ${users.length} users.`);
    
    saveToExcel(users);
    
    const excelPath = path.join(__dirname, '../user_data.xlsx');
    if (fs.existsSync(excelPath)) {
        console.log(`✅ SUCCESS: ${excelPath} created!`);
    } else {
        console.log("❌ FAILURE: Excel file not found.");
    }
} else {
    console.log("mem_users.json not found. Run the server first.");
}
