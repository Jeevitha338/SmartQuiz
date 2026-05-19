const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Fix paths to be relative to project root
const ROOT = path.join(__dirname, '..');
const USERS_FILE = path.join(ROOT, 'mem_users.json');

async function cleanup() {
    console.log("--- Subscription Cleanup Started ---");

    // 1. Cleanup In-Memory File
    if (fs.existsSync(USERS_FILE)) {
        let memUsers = JSON.parse(fs.readFileSync(USERS_FILE));
        let count = 0;
        memUsers.forEach(u => {
            if (u.isSubscribed && !u.lastTransactionId) {
                u.isSubscribed = false;
                u.subscriptionExpiry = null;
                count++;
            }
        });
        fs.writeFileSync(USERS_FILE, JSON.stringify(memUsers, null, 2));
        console.log(`[Memory] Reset ${count} users who were Pro without a Transaction ID.`);
    } else {
        console.log("[Memory] No mem_users.json file found.");
    }

    // 2. Cleanup MongoDB
    try {
        if (!process.env.MONGO_URI) {
            console.log("[MongoDB] No MONGO_URI in .env, skipping.");
        } else {
            await mongoose.connect(process.env.MONGO_URI, { family: 4 });
            // Correct model path
            const User = require(path.join(ROOT, 'models', 'User'));
            const result = await User.updateMany(
                { isSubscribed: true, lastTransactionId: { $exists: false } },
                { $set: { isSubscribed: false, subscriptionExpiry: null } }
            );
            console.log(`[MongoDB] Reset ${result.modifiedCount} users who were Pro without a Transaction ID.`);
            await mongoose.disconnect();
        }
    } catch (err) {
        console.error("[MongoDB] Connection/Update failed.", err.message);
    }

    console.log("--- Cleanup Finished ---");
}

cleanup();
