const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function resetData() {
    console.log("--- RESETTING SMARTQUIZ DATA ---");

    // 1. Clear Local JSON Files
    const files = [
        '../mem_users.json',
        '../mem_certs.json',
        '../developer_audit.csv',
        '../user_data.xlsx'
    ];

    files.forEach(f => {
        const fullPath = path.join(__dirname, f);
        if (fs.existsSync(fullPath)) {
            if (f.endsWith('.json')) {
                fs.writeFileSync(fullPath, '[]');
                console.log(`Cleared: ${f}`);
            } else {
                fs.unlinkSync(fullPath);
                console.log(`Deleted: ${f}`);
            }
        }
    });

    // 2. Clear MongoDB Collections
    if (process.env.MONGO_URI) {
        try {
            console.log("Connecting to MongoDB for wipe...");
            await mongoose.connect(process.env.MONGO_URI, { family: 4 });
            
            const collections = await mongoose.connection.db.collections();
            for (let collection of collections) {
                await collection.deleteMany({});
                console.log(`Cleared MongoDB Collection: ${collection.collectionName}`);
            }
            await mongoose.disconnect();
            console.log("MongoDB wiped successfully.");
        } catch (err) {
            console.error("MongoDB Wipe Error:", err.message);
        }
    } else {
        console.log("No MONGO_URI found, skipping DB wipe.");
    }

    console.log("\n✅ ALL DATA CLEARED. Please RESTART your server now.");
}

resetData();
