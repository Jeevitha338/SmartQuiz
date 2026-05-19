const XLSX = require('xlsx');
const path = require('path');
const EXCEL_PATH = path.join(__dirname, '../user_data.xlsx');

try {
    const workbook = XLSX.readFile(EXCEL_PATH);
    const adminSheet = workbook.Sheets["Admins"];
    const admins = XLSX.utils.sheet_to_json(adminSheet);
    console.log(`Admins in Excel: ${admins.length}`);
    admins.forEach(a => console.log(`- ${a.Name} (${a.Email})`));

    const studentSheet = workbook.Sheets["Students"];
    const students = XLSX.utils.sheet_to_json(studentSheet);
    console.log(`Students in Excel: ${students.length}`);
    students.forEach(s => console.log(`- ${s.Name} (${s.Email})`));
} catch (e) {
    console.log("Error reading Excel:", e.message);
}
