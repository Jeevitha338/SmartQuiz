const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const ROOT = path.join(__dirname, '..');
const USERS_FILE = path.join(ROOT, 'mem_users.json');

async function megaCleanup() {
    console.log("--- MEGA Subscription Cleanup Started ---");

    // 1. Reset In-Memory File
    if (fs.existsSync(USERS_FILE)) {
        let memUsers = JSON.parse(fs.readFileSync(USERS_FILE));
        let count = 0;
        memUsers.forEach(u => {
            // Only keep Pro if they have a real Razorpay ID (starts with pay_)
            if (u.isSubscribed && (!u.lastTransactionId || !u.lastTransactionId.startsWith('pay_'))) {
                u.isSubscribed = false;
                u.subscriptionExpiry = null;
                u.lastTransactionId = null;
                count++;
            }
        });
        fs.writeFileSync(USERS_FILE, JSON.stringify(memUsers, null, 2));
        console.log(`[Memory] Reset ${count} users.`);
    }

    // 2. Reset MongoDB
    try {
        if (process.env.MONGO_URI) {
            await mongoose.connect(process.env.MONGO_URI, { family: 4 });
            const User = require(path.join(ROOT, 'models', 'User'));
            
            // Reset anyone who doesn't have a razorpay ID starting with pay_
            // Note: MongoDB regex check for pay_
            const result = await User.updateMany(
                { 
                    isSubscribed: true, 
                    $or: [
                        { lastTransactionId: { $exists: false } },
                        { lastTransactionId: { $not: /^pay_/ } }
                    ]
                },
                { $set: { isSubscribed: false, subscriptionExpiry: null, lastTransactionId: null } }
            );
            console.log(`[MongoDB] Reset ${result.modifiedCount} users.`);
            await mongoose.disconnect();
        }
    } catch (err) {
        console.error("[MongoDB] Reset failed.", err.message);
    }

    console.log("--- MEGA Cleanup Finished ---");
}

megaCleanup();
