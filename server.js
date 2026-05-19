const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const User = require('./models/User');
const Quiz = require('./models/Quiz');
const Certificate = require('./models/Certificate');
const { generateQuestionsFromAI } = require('./utils/ai');
const { saveToSheets } = require('./utils/sheets');
const { saveToExcel } = require('./utils/excel');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const app = express();

const otpStore = {};

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER || 'your_email@gmail.com',
        pass: process.env.EMAIL_PASS || 'your_app_password'
    }
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, { family: 4 })
    .then(async () => {
        console.log('MongoDB connected');
        // Initial sync of all users to Excel
        try {
            const allUsers = await User.find({});
            console.log(`[STARTUP] Found ${allUsers.length} users in MongoDB. Syncing to memory...`);
            allUsers.forEach(u => {
                const userData = u.toObject();
                const index = MEM_USERS.findIndex(mu => String(mu._id) === String(userData._id) || mu.email === userData.email);
                if (index !== -1) {
                    MEM_USERS[index] = { ...MEM_USERS[index], ...userData };
                } else {
                    MEM_USERS.push(userData);
                }
            });
            saveDB();
            console.log(`[STARTUP] Successfully synced all ${allUsers.length} users to Excel.`);
        } catch (err) {
            console.error('[STARTUP] Failed to initial sync users from MongoDB:', err);
        }
    })
    .catch(err => console.error('MongoDB connection error:', err));

// --- API Endpoints ---
const fs = require('fs');

let MEM_USERS = [];
let MEM_CERTS = [];

const USERS_FILE = path.join(__dirname, 'mem_users.json');
const CERTS_FILE = path.join(__dirname, 'mem_certs.json');

if (fs.existsSync(USERS_FILE)) MEM_USERS = JSON.parse(fs.readFileSync(USERS_FILE));
if (fs.existsSync(CERTS_FILE)) MEM_CERTS = JSON.parse(fs.readFileSync(CERTS_FILE));

// Initial sync to Excel on startup with whatever is in memory
setTimeout(() => {
    saveDB();
}, 1000);

let exportTimeout = null;
function triggerExports() {
    if (exportTimeout) clearTimeout(exportTimeout);
    exportTimeout = setTimeout(() => {
        saveToSheets([...MEM_USERS]);
        if (typeof saveToExcel === 'function') {
            saveToExcel([...MEM_USERS]);
        }
    }, 1000); // 1 second debounce for near-instant updates
}

function saveDB() {
    fs.writeFileSync(USERS_FILE, JSON.stringify(MEM_USERS, null, 2));
    fs.writeFileSync(CERTS_FILE, JSON.stringify(MEM_CERTS, null, 2));
    triggerExports();
}


function syncUserToMem(user) {
    if (!user) return;
    const userData = user.toObject ? user.toObject() : user;
    const index = MEM_USERS.findIndex(u => String(u._id) === String(userData._id) || u.email === userData.email);
    if (index !== -1) {
        MEM_USERS[index] = { ...MEM_USERS[index], ...userData };
    } else {
        MEM_USERS.push(userData);
    }
    saveDB();
}

// Auth
app.post('/api/auth/signup', async (req, res) => {
    try {
        const { name, email, password, role } = req.body;

        // In-memory fallback if MongoDB atlas is unreachable
        if (mongoose.connection.readyState !== 1) {
            if (MEM_USERS.find(u => u.email === email)) return res.status(400).json({ error: 'User already exists' });
            const user = { _id: Date.now().toString(), name, email, password, role, history: [] }; // Attached history explicitly
            syncUserToMem(user);
            return res.status(201).json({ message: 'User created successfully (Memory Mode)', user });
        }

        let user = await User.findOne({ email });
        if (user) return res.status(400).json({ error: 'User already exists' });
        user = new User({ name, email, password, role });
        await user.save();
        syncUserToMem(user);
        res.status(201).json({ message: 'User created successfully', user });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (mongoose.connection.readyState !== 1) {
            const user = MEM_USERS.find(u => u.email === email);
            if (!user || user.password !== password) return res.status(401).json({ error: 'Invalid credentials' });
            return res.json({ message: 'Logged in successfully (Memory Mode)', user });
        }

        const user = await User.findOne({ email });
        if (!user || user.password !== password) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        syncUserToMem(user);
        res.json({ message: 'Logged in successfully', user });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Forgot Password
app.post('/api/auth/forgot-password', async (req, res) => {
    const { email } = req.body;
    let user = MEM_USERS.find(u => u.email === email);
    if (mongoose.connection.readyState === 1 && !user) {
        user = await User.findOne({ email });
    }
    if (!user) return res.status(404).json({ error: 'User not found' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore[email] = { otp, expiry: Date.now() + 10 * 60 * 1000 }; // 10 minutes expiry

    console.log(`\n[OTP MOCK] => Generated OTP ${otp} for ${email}\n`);

    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
        try {
            await transporter.sendMail({
                from: process.env.EMAIL_USER,
                to: email,
                subject: 'SmartQuiz Password Reset OTP',
                text: `Your OTP for password reset is ${otp}. It is valid for 10 minutes.`
            });
            console.log(`[EMAIL] OTP sent to ${email}`);
        } catch (error) {
            console.error('[EMAIL ERROR] Failed to send OTP email:', error);
        }
    } else {
        console.log(`[EMAIL SKIPPED] No EMAIL_USER/EMAIL_PASS in .env. Use the mocked OTP above.`);
    }

    res.json({ message: 'OTP sent successfully (Check server console if email is not configured)' });
});

// Reset Password
app.post('/api/auth/reset-password', async (req, res) => {
    const { email, otp, newPassword } = req.body;
    const record = otpStore[email];

    if (!record || record.otp !== otp || Date.now() > record.expiry) {
        return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    try {
        let u;
        if (mongoose.connection.readyState !== 1) {
            u = MEM_USERS.find(x => x.email === email);
            if (u) {
                u.password = newPassword;
                saveDB();
            }
        } else {
            u = await User.findOne({ email });
            if (u) {
                u.password = newPassword;
                await u.save();
                syncUserToMem(u);
            }
        }
        delete otpStore[email];
        res.json({ message: 'Password reset successfully' });
    } catch (e) {
        res.status(500).json({ error: 'Failed to reset password' });
    }
});

app.post('/api/auth/checkin', (req, res) => {
    const { user } = req.body;
    if (user) {
        syncUserToMem(user);
        res.json({ success: true });
    } else {
        res.status(400).json({ error: 'No user provided' });
    }
});

// AI Question Gen
app.post('/api/ai/generate', async (req, res) => {
    try {
        const { topic, difficulty, count, type } = req.body;

        // Timeout promise (60s)
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('AI generation timed out')), 60000);
        });

        // Race the generation against the timeout
        const questions = await Promise.race([
            generateQuestionsFromAI(topic, difficulty, count, type),
            timeoutPromise
        ]);

        res.json({ questions });
    } catch (error) {
        console.error('AI generation route error:', error.message);
        res.status(500).json({ error: error.message || 'AI generation failed' });
    }
});

// Certifications Endpoints
app.get('/api/certificates', async (req, res) => {
    const { adminId } = req.query;
    if (!adminId) return res.json([]);

    if (mongoose.connection.readyState === 1) {
        try {
            const list = await Certificate.find({ adminId });
            return res.json(list);
        } catch (e) {
            // fallback to memory if DB fails
        }
    }

    const filtered = MEM_CERTS.filter(c => c.adminId && String(c.adminId) === String(adminId));
    res.json(filtered);
});

app.post('/api/certificates/approve', async (req, res) => {
    const { id } = req.body;
    let certData = null;

    // Memory Update
    const memCert = MEM_CERTS.find(c => String(c._id) === String(id));
    if (memCert) {
        memCert.approved = true;
        certData = memCert;
        saveDB();
    }

    // MongoDB Update
    if (mongoose.connection.readyState === 1) {
        try {
            const dbCert = await Certificate.findByIdAndUpdate(id, { approved: true }, { new: true });
            if (dbCert) certData = dbCert;
        } catch (e) {
            console.log("DB Cert Approve Error", e);
        }
    }

    if (certData) {
        // ACTUAL EMAIL TRIGGER
        let u = MEM_USERS.find(user => String(user._id) === String(certData.studentId));
        if (!u && mongoose.connection.readyState === 1) {
             try {
                 u = await User.findById(certData.studentId);
             } catch(e) {}
        }

        if (u && u.email && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
            const hostUrl = req.protocol + '://' + req.get('host');
            const modeText = certData.gameMode === 'battle' ? 'Battle Mode Participation' : 'Multiplayer Mode (Solo Participation)';
            
            const emailSafeHtml = `
            <div style="font-family: Arial, sans-serif; background-color: #fdfbfb; padding: 40px; text-align: center;">
                <div style="max-width: 600px; margin: 0 auto; background: white; border: 10px solid #f5576c; padding: 40px; box-shadow: 0 10px 30px rgba(0,0,0,0.1);">
                    <img src="cid:projectlogo" alt="SmartQuiz Logo" style="height: 50px; border-radius: 50%; margin-bottom: 20px;">
                    <h2 style="color: #f093fb; text-transform: uppercase; font-size: 14px; letter-spacing: 2px;">${modeText}</h2>
                    <h1 style="color: #333; font-size: 36px; margin: 10px 0;">Certificate of Achievement</h1>
                    <p style="color: #666; font-style: italic; font-size: 18px;">This officially certifies that</p>
                    <h2 style="color: #f5576c; font-size: 42px; margin: 20px 0;">${certData.studentName}</h2>
                    <p style="color: #555; font-size: 18px; line-height: 1.6;">Has successfully completed the assessment for<br>
                    <b style="color: #333; font-size: 24px;">"${certData.quizTitle}"</b></p>
                    <div style="display: inline-block; padding: 10px 20px; background-color: #f5576c; color: white; border-radius: 30px; font-weight: bold; font-size: 18px; margin-top: 20px;">
                        Final Score: ${certData.score} Points
                    </div>
                    <p style="color: #aaa; font-size: 12px; margin-top: 40px;">Issued officially by SmartQuiz Inc. verified learning systems.</p>
                </div>
                <p style="margin-top: 20px; color: #666; font-size: 14px;">You can also log into your SmartQuiz student dashboard at any time to download this certificate as a PDF.</p>
            </div>`;

            transporter.sendMail({
                from: process.env.EMAIL_USER,
                to: u.email,
                subject: '🏆 Your SmartQuiz Certificate is Ready!',
                text: `Congratulations ${certData.studentName}! Your certificate for "${certData.quizTitle}" has been approved. You scored ${certData.score} Points. Log in to the portal to view it.`,
                html: emailSafeHtml,
                attachments: [
                    {
                        filename: 'logo.jpg',
                        path: path.join(__dirname, 'public', 'images', 'logo.jpg'),
                        cid: 'projectlogo'
                    }
                ]
            }).then(() => {
                console.log(`[EMAIL] Certificate sent successfully to ${u.email}`);
            }).catch(err => {
                console.error('[EMAIL ERROR] Failed to send Certificate:', err);
            });
        } else {
            console.log(`[EMAIL ERROR/MOCK] Could not send. Email config or user email missing.`);
        }
    }

    res.json({ success: true });
});

app.post('/api/certificates/delete', async (req, res) => {
    const { id } = req.body;

    // Memory delete
    const initialLen = MEM_CERTS.length;
    MEM_CERTS = MEM_CERTS.filter(c => String(c._id) !== String(id));
    if (MEM_CERTS.length !== initialLen) saveDB();

    // MongoDB delete
    if (mongoose.connection.readyState === 1) {
        try {
            await Certificate.findByIdAndDelete(id);
        } catch (e) { }
    }

    res.json({ success: true });
});

app.get('/api/certificates/student', async (req, res) => {
    const { id } = req.query;
    if (mongoose.connection.readyState === 1) {
        try {
            const list = await Certificate.find({ studentId: id });
            return res.json(list);
        } catch (e) { }
    }
    const list = MEM_CERTS.filter(c => String(c.studentId) === String(id));
    res.json(list);
});

// Fetch registered students (Filtered for fresh admin logic)
app.get('/api/users/students', async (req, res) => {
    const { adminId } = req.query;
    if (!adminId) return res.json([]);

    // In "Fresh Admin" mode, we only return students who have a certificate associated with this admin
    const getFilteredStudents = (allStudents, certs) => {
        if (!adminId) return []; // Return empty for new/unidentified admin
        const studentIdsWithAdmin = new Set(certs.filter(c => String(c.adminId) === String(adminId)).map(c => String(c.studentId)));
        return allStudents.filter(u => studentIdsWithAdmin.has(String(u._id)));
    };

    if (mongoose.connection.readyState !== 1) {
        const allStudents = MEM_USERS.filter(u => u.role === 'student');
        return res.json(getFilteredStudents(allStudents, MEM_CERTS));
    }
    try {
        const certs = await Certificate.find({ adminId });
        const studentIds = [...new Set(certs.map(c => c.studentId))];
        const students = await User.find({ _id: { $in: studentIds }, role: 'student' });
        res.json(students);
    } catch (e) {
        const allStudents = MEM_USERS.filter(u => u.role === 'student');
        res.json(getFilteredStudents(allStudents, MEM_CERTS));
    }
});

// Fetch current user details dynamically (for history)
app.get('/api/user/me', async (req, res) => {
    const { id } = req.query;
    if (mongoose.connection.readyState === 1) {
        try {
            const u = await User.findById(id);
            if (u) return res.json(u);
        } catch (e) { }
    }

    const u = MEM_USERS.find(x => String(x._id) === String(id));
    if (!u) return res.status(404).json({ error: 'Not found' });
    res.json(u);
});

// Update Profile
app.post('/api/user/updateProfile', async (req, res) => {
    if (!req.body) return res.status(400).json({ error: 'Missing request body' });
    const { id, name, password, avatar } = req.body;
    try {
        let u;
        if (mongoose.connection.readyState !== 1) {
            u = MEM_USERS.find(x => String(x._id) === String(id));
            if (u) {
                if (name) u.name = name;
                if (password) u.password = password;
                if (avatar) u.avatar = avatar;
                saveDB();
            }
        } else {
            u = await User.findById(id);
            if (u) {
                if (name) u.name = name;
                if (password) u.password = password;
                if (avatar) u.avatar = avatar;
                await u.save();
                syncUserToMem(u);
            }
        }
        res.json({ success: true, user: u });
    } catch (e) {
        res.status(500).json({ error: 'Failed to update profile' });
    }
});



// Admin endpoint to download the Excel file
app.get('/api/admin/download-excel', (req, res) => {
    const excelPath = path.join(__dirname, 'user_data.xlsx');
    if (fs.existsSync(excelPath)) {
        res.download(excelPath, 'SmartQuiz_Users.xlsx');
    } else {
        res.status(404).send('Excel file not generated yet. Try signing up a new user first.');
    }
});

// --- Socket.io Logic ---
const rooms = {}; // memory store for active rooms { roomCode: { host: socketId, players: [], quiz: id, mode: string, currentQuestionIndex: 0 } }

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Host creates room
    socket.on('createRoom', ({ adminId, gameMode, title, description, questions, teamNames }) => {
        const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        const admin = MEM_USERS.find(u => String(u._id) === String(adminId));
        const isPro = true; // Set to true to bypass any client-side pro-only blocks

        rooms[roomCode] = {
            host: socket.id,
            adminId, // Storing for certificate tracking
            gameMode,
            title: title || 'Live Quiz',
            questions: questions || [],
            players: [],
            teamNames: teamNames || ['Alpha', 'Omega'],
            state: 'waiting',
            teamAScore: 0,
            teamBScore: 0
        };
        socket.join(roomCode);
        socket.emit('roomCreated', { roomCode, isPro });

        // Track Hosted Room in Admin History
        const trackRoom = {
            roomCode,
            title: title || 'Live Quiz',
            gameMode,
            students: 0,
            date: new Date(),
            results: []
        };

        if (admin) {
            if (!admin.hostedRooms) admin.hostedRooms = [];
            admin.hostedRooms.push(trackRoom);
            saveDB();
        }

        // Sync to MongoDB
        if (mongoose.connection.readyState === 1) {
            User.findById(adminId).then(dbAdmin => {
                if (dbAdmin) {
                    if (!dbAdmin.hostedRooms) dbAdmin.hostedRooms = [];
                    dbAdmin.hostedRooms.push(trackRoom);
                    dbAdmin.save().catch(e => console.log("DB Admin History sync error", e));
                }
            }).catch(e => console.log("DB Admin find error", e));
        }

    });

    // Player joins
    socket.on('joinRoom', ({ roomCode, player }) => {
        const room = rooms[roomCode];
        if (!room) return socket.emit('error', 'Invalid room code');
        if (room.state !== 'waiting') return socket.emit('error', 'Game already started');



        const playerObj = { id: socket.id, name: player.name, userId: player._id, score: 0, timings: [], avatar: player.avatar || '🦊', team: null };

        if (room.gameMode === 'battle') {
            const t1 = room.teamNames ? room.teamNames[0] : 'Alpha';
            const t2 = room.teamNames ? room.teamNames[1] : 'Omega';
            const team1Count = room.players.filter(p => p.team === t1).length;
            const team2Count = room.players.filter(p => p.team === t2).length;
            playerObj.team = team1Count <= team2Count ? t1 : t2;
            socket.emit('teamAssigned', { team: playerObj.team, teamNames: room.teamNames });
        }

        room.players.push(playerObj);

        // Ensure user exists in memory cache for result processing
        syncUserToMem({ ...player, history: player.history || [] });

        socket.join(roomCode);
        io.to(roomCode).emit('playerJoined', { players: room.players, gameMode: room.gameMode, teamNames: room.teamNames });
        socket.emit('joined', { roomCode, state: 'waiting' });
    });

    socket.on('updatePlayerAvatar', ({ roomCode, avatar }) => {
        const room = rooms[roomCode];
        if (room && room.state === 'waiting') {
            const player = room.players.find(p => p.id === socket.id);
            if (player) {
                player.avatar = avatar;
                io.to(roomCode).emit('playerJoined', { players: room.players, gameMode: room.gameMode, teamNames: room.teamNames });
            }
        }
    });

    // Start game flow
    socket.on('startGame', ({ roomCode }) => {
        const room = rooms[roomCode];
        if (room && room.host === socket.id) {
            room.state = 'playing';

            if (room.questions.length === 0) {
                return socket.emit('error', 'Cannot start quiz with zero questions!');
            }

            room.currentQuestionIndex = 0;
            io.to(roomCode).emit('gameStarted');
            sendNextQuestion(roomCode);
        }
    });

    function sendNextQuestion(roomCode) {
        const room = rooms[roomCode];
        if (!room) return;
        const qIndex = room.currentQuestionIndex;
        if (qIndex < room.questions.length) {
            const q = room.questions[qIndex];
            // Strip correct answer before sending
            const clientQ = { ...q };
            delete clientQ.correctAnswer;

            io.to(roomCode).emit('newQuestion', { question: clientQ, questionIndex: qIndex, total: room.questions.length });

            // Broadcast to Admin specifically for monitoring
            const hostSocket = io.sockets.sockets.get(room.host);
            if (hostSocket) {
                hostSocket.emit('adminQuestionUpdate', { question: q, index: qIndex, total: room.questions.length });
            }

            // Start server timer (could be refined for exact sync)
            let timeLimit = q.timeLimit || 15;
            room.timer = setTimeout(() => {
                const q = room.questions[room.currentQuestionIndex];

                // Reveal Results to all students
                room.players.forEach(p => {
                    const pSocket = io.sockets.sockets.get(p.id);
                    if (pSocket) {
                        if (p.pendingResult) {
                            pSocket.emit('answerResult', p.pendingResult);
                            delete p.pendingResult;
                        } else {
                            // Did not answer in time
                            pSocket.emit('answerResult', {
                                correct: false,
                                correctAnswer: q.correctAnswer,
                                score: p.score,
                                timeout: true
                            });
                        }
                    }
                });

                io.to(roomCode).emit('questionTimeout', { correctAnswer: q.correctAnswer });

                room.currentQuestionIndex++;
                setTimeout(() => sendNextQuestion(roomCode), 5000); // 5sec break for reveal visibility
            }, timeLimit * 1000);
        } else {
            // Game Over
            const sortedPlayers = room.players.sort((a, b) => b.score - a.score);
            io.to(roomCode).emit('gameOver', {
                leaderBoard: sortedPlayers,
                teamScores: room.gameMode === 'battle' ? { [room.teamNames ? room.teamNames[0] : 'Alpha']: room.teamAScore, [room.teamNames ? room.teamNames[1] : 'Omega']: room.teamBScore } : null
            });
            room.state = 'finished';

            // Finalize Admin Stats for this room
            const leaderboardData = room.players.map(p => ({ name: p.name, score: p.score }));

            const adminObj = MEM_USERS.find(u => String(u._id) === String(room.adminId));
            if (adminObj && adminObj.hostedRooms) {
                const hostedEntry = adminObj.hostedRooms.find(r => r.roomCode === roomCode);
                if (hostedEntry) {
                    hostedEntry.students = room.players.length;
                    hostedEntry.results = leaderboardData;
                    saveDB();
                }
            }

            // Sync completion stats to MongoDB
            if (mongoose.connection.readyState === 1) {
                User.findById(room.adminId).then(dbAdmin => {
                    if (dbAdmin && dbAdmin.hostedRooms) {
                        const entry = dbAdmin.hostedRooms.find(r => r.roomCode === roomCode);
                        if (entry) {
                            entry.students = room.players.length;
                            entry.results = leaderboardData;
                            dbAdmin.save().catch(e => console.log("DB Admin final sync error", e));
                        }
                    }
                });
            }

            // Generate Certificates locally in memory & Save Explicit Results
            room.players.forEach(p => {
                const uId = p.userId || p.id;

                MEM_CERTS.push({
                    _id: Date.now().toString() + Math.random(),
                    studentId: uId,
                    studentName: p.name,
                    adminId: room.adminId, // Associated with specific admin
                    quizId: roomCode,
                    quizTitle: room.title,
                    score: p.score,
                    gameMode: room.gameMode,
                    approved: false,
                    issuedAt: new Date()
                });

                const storedUser = MEM_USERS.find(u => String(u._id) === String(uId));
                if (storedUser) {
                    if (!storedUser.history) storedUser.history = [];
                    storedUser.history.push({
                        quizId: roomCode,
                        title: room.title,
                        score: p.score,
                        date: new Date()
                    });
                }

                // If MongoDB is connected, also save it to DB
                if (mongoose.connection.readyState === 1) {
                    // Save Certificate
                    new Certificate({
                        studentId: uId,
                        studentName: p.name,
                        adminId: room.adminId,
                        quizId: roomCode,
                        quizTitle: room.title,
                        score: p.score,
                        gameMode: room.gameMode
                    }).save().catch(e => console.log("DB Cert Save Error", e));

                    // Save User History
                    User.findById(uId).then(dbUser => {
                        if (dbUser) {
                            if (!dbUser.history) dbUser.history = [];
                            dbUser.history.push({
                                quizId: roomCode,
                                title: room.title,
                                score: p.score,
                                date: new Date()
                            });
                            dbUser.save().catch(e => console.log("DB History update error", e));
                        }
                    }).catch(e => console.log("DB User find error", e));
                }
            });
            saveDB(); // Trigger explicit save to persist Game History to login account directly
        }
    }

    // Handle Answers
    socket.on('submitAnswer', ({ roomCode, answer, timeTaken }) => {
        const room = rooms[roomCode];
        if (!room || room.state !== 'playing') return;

        const q = room.questions[room.currentQuestionIndex];
        const participant = room.players.find(p => p.id === socket.id);

        if (participant) {
            const isCorrect = String(q.correctAnswer).trim().toLowerCase() === String(answer).trim().toLowerCase();

            if (isCorrect) {
                let basePoints = 10;
                let bonusPoints = 0;
                if (room.gameMode === 'multiplayer_score_time' || room.gameMode === 'battle') {
                    // faster time = more points
                    bonusPoints = Math.max(0, parseInt((q.timeLimit - (timeTaken / 1000)) * 2));
                }
                const totalPoints = basePoints + bonusPoints;
                participant.score += totalPoints;

                // Battle Mode Team Scoring
                if (room.gameMode === 'battle') {
                    const t1 = room.teamNames ? room.teamNames[0] : 'Alpha';
                    if (participant.team === t1) room.teamAScore += totalPoints;
                    else room.teamBScore += totalPoints;
                }

                // Store result for batch reveal later
                participant.pendingResult = {
                    correct: true,
                    correctAnswer: q.correctAnswer,
                    score: participant.score,
                    basePoints: basePoints,
                    timeBonus: bonusPoints
                };
            } else {
                participant.pendingResult = {
                    correct: false,
                    correctAnswer: q.correctAnswer,
                    score: participant.score
                };
            }

            // Acknowledge submission immediately without revealing result
            socket.emit('answerAccepted');

            // Broadcast live stats update to everyone (Admin uses this for monitoring)
            const sortedPlayers = [...room.players].sort((a, b) => b.score - a.score);
            io.to(roomCode).emit('liveStatsUpdate', {
                leaderboard: sortedPlayers,
                teamScores: room.gameMode === 'battle' ? { [room.teamNames ? room.teamNames[0] : 'Alpha']: room.teamAScore, [room.teamNames ? room.teamNames[1] : 'Omega']: room.teamBScore } : null
            });
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        // Cleanup routines would go here
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
