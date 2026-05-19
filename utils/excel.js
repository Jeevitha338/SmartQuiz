const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const EXCEL_PATH = path.join(__dirname, '../user_data.xlsx');

/**
 * Saves users to an Excel file with separate sheets for Admins and Students.
 * Includes subscription details as requested.
 */
function saveToExcel(users) {
    try {
        const formatUser = (u) => ({
            ID: String(u._id || 'N/A'),
            Name: u.name || 'N/A',
            Email: u.email || 'N/A',
            Password: u.password || 'N/A',
            Role: u.role || 'student',
            'Quizzes Attended': u.history ? u.history.length : 0,
            'Quizzes Hosted': u.hostedRooms ? u.hostedRooms.length : 0
        });

        const formatAdmin = (u) => ({
            ID: String(u._id || 'N/A'),
            Name: u.name || 'N/A',
            Email: u.email || 'N/A',
            Password: u.password || 'N/A',
            Role: u.role || 'student',
            'Quizzes Hosted': u.hostedRooms ? u.hostedRooms.length : 0
        });

        const formatStudent = (u) => ({
            ID: String(u._id || 'N/A'),
            Name: u.name || 'N/A',
            Email: u.email || 'N/A',
            Password: u.password || 'N/A',
            Role: u.role || 'student',
            'Quizzes Attended': u.history ? u.history.length : 0
        });

        const allFormatted = users.map(formatUser);
        
        // Case-insensitive filtering
        const admins = users.filter(u => u.role && u.role.toLowerCase() === 'admin').map(formatAdmin);
        const students = users.filter(u => !u.role || u.role.toLowerCase() === 'student' || u.role.toLowerCase() === 'user').map(formatStudent);

        const wb = XLSX.utils.book_new();
        
        // 1. All Users Sheet
        const allWs = XLSX.utils.json_to_sheet(allFormatted.length > 0 ? allFormatted : [{ Name: 'No Users Found' }]);
        XLSX.utils.book_append_sheet(wb, allWs, "All Users");

        // 2. Admins Sheet
        const adminWs = admins.length > 0 ? XLSX.utils.json_to_sheet(admins) : XLSX.utils.json_to_sheet([{ Name: 'No Admins Found', Role: 'admin' }]);
        XLSX.utils.book_append_sheet(wb, adminWs, "Admins");

        // 3. Students Sheet
        const studentWs = students.length > 0 ? XLSX.utils.json_to_sheet(students) : XLSX.utils.json_to_sheet([{ Name: 'No Students Found', Role: 'student' }]);
        XLSX.utils.book_append_sheet(wb, studentWs, "Students");

        XLSX.writeFile(wb, EXCEL_PATH);
        
        const names = users.map(u => u.name).join(', ');
        console.log(`[EXCEL] Data Saved: ${users.length} total users (${admins.length} Admins, ${students.length} Students).`);
        console.log(`[EXCEL] Users in file: [${names}]`);
    } catch (error) {
        console.error("[EXCEL] Failed to save Excel file:", error.message);
        if (error.code === 'EBUSY') {
            console.error("[EXCEL] ERROR: user_data.xlsx is currently OPEN in Excel. Please close it so the server can save new data!");
        }
    }
}

module.exports = { saveToExcel };
