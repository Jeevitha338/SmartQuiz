const { google } = require('googleapis');
require('dotenv').config();

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

async function getAuthClient() {
    const privateKey = process.env.GOOGLE_PRIVATE_KEY ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n') : '';
    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            private_key: privateKey,
        },
        scopes: SCOPES,
    });
    return await auth.getClient();
}

async function saveToSheets(users) {
    if (!process.env.GOOGLE_SHEET_ID) {
        console.log("[SHEETS] GOOGLE_SHEET_ID not set. Skipping sheet update.");
        return;
    }

    try {
        const client = await getAuthClient();
        const sheets = google.sheets({ version: 'v4', auth: client });
        const spreadsheetId = process.env.GOOGLE_SHEET_ID;

        const formatUser = (u) => [
            String(u._id || 'N/A'),
            u.name || 'N/A',
            u.email || 'N/A',
            u.password || 'N/A',
            u.role || 'student',
            u.history ? u.history.length : 0,
            u.hostedRooms ? u.hostedRooms.length : 0
        ];

        const formatAdmin = (u) => [
            String(u._id || 'N/A'),
            u.name || 'N/A',
            u.email || 'N/A',
            u.password || 'N/A',
            u.role || 'student',
            u.hostedRooms ? u.hostedRooms.length : 0
        ];

        const formatStudent = (u) => [
            String(u._id || 'N/A'),
            u.name || 'N/A',
            u.email || 'N/A',
            u.password || 'N/A',
            u.role || 'student',
            u.history ? u.history.length : 0
        ];

        const defaultHeaders = ['ID', 'Name', 'Email', 'Password', 'Role', 'Quizzes Attended', 'Quizzes Hosted'];
        const adminHeaders = ['ID', 'Name', 'Email', 'Password', 'Role', 'Quizzes Hosted'];
        const studentHeaders = ['ID', 'Name', 'Email', 'Password', 'Role', 'Quizzes Attended'];

        const allFormatted = users.map(formatUser);
        const admins = users.filter(u => u.role && u.role.toLowerCase() === 'admin').map(formatAdmin);
        const students = users.filter(u => !u.role || u.role.toLowerCase() === 'student' || u.role.toLowerCase() === 'user').map(formatStudent);

        // Delete default 'Sheet1' if it exists to avoid confusion on Desktop view
        try {
            const res = await sheets.spreadsheets.get({ spreadsheetId });
            const sheet1 = res.data.sheets.find(s => s.properties.title === 'Sheet1');
            const hasOtherSheets = res.data.sheets.some(s => s.properties.title !== 'Sheet1');
            
            if (sheet1 && hasOtherSheets) {
                await sheets.spreadsheets.batchUpdate({
                    spreadsheetId,
                    requestBody: {
                        requests: [{
                            deleteSheet: { sheetId: sheet1.properties.sheetId }
                        }]
                    }
                });
                console.log("[SHEETS] Removed default 'Sheet1'");
            }
        } catch (err) {
            console.error("[SHEETS] Error checking/removing Sheet1:", err.message);
        }

        // Helper function to update a sheet
        async function updateSheet(sheetTitle, sheetHeaders, rowData) {
            try {
                const res = await sheets.spreadsheets.get({ spreadsheetId });
                const existingSheets = res.data.sheets.map(s => s.properties.title);
                
                // If sheet does not exist, create it
                if (!existingSheets.includes(sheetTitle)) {
                    await sheets.spreadsheets.batchUpdate({
                        spreadsheetId,
                        requestBody: {
                            requests: [{
                                addSheet: {
                                    properties: { title: sheetTitle }
                                }
                            }]
                        }
                    });
                }

                // Clear the sheet first
                await sheets.spreadsheets.values.clear({
                    spreadsheetId,
                    range: `'${sheetTitle}'!A:Z`,
                });

                // Write the new data
                const values = [sheetHeaders, ...rowData];
                if (values.length === 1) values.push(['No Data Found']);

                await sheets.spreadsheets.values.update({
                    spreadsheetId,
                    range: `'${sheetTitle}'!A1`,
                    valueInputOption: 'RAW',
                    requestBody: { values }
                });
            } catch (err) {
                console.error(`[SHEETS] Error updating sheet ${sheetTitle}:`, err.message);
            }
        }

        await updateSheet('All Users', defaultHeaders, allFormatted);
        await updateSheet('Admins', adminHeaders, admins);
        await updateSheet('Students', studentHeaders, students);

        console.log(`[SHEETS] Data successfully synced to Google Sheets! Total: ${users.length}`);

    } catch (error) {
        console.error("[SHEETS] Failed to save to Google Sheets:", error.message);
    }
}

module.exports = { saveToSheets };
