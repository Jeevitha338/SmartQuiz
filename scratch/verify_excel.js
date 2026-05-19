const XLSX = require('xlsx');
const path = require('path');

const EXCEL_PATH = path.join(__dirname, '../user_data.xlsx');

try {
    const workbook = XLSX.readFile(EXCEL_PATH);
    workbook.SheetNames.forEach(sheetName => {
        console.log(`--- Sheet: ${sheetName} ---`);
        const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
        console.table(data);
    });
} catch (error) {
    console.error("Error reading Excel:", error.message);
}
