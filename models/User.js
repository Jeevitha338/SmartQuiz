const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'student'], required: true },
  avatar: { type: String, default: '🦊' },
  score: { type: Number, default: 0 },
  strikeRate: { type: Number, default: 0 },
  quizzesAttended: { type: Number, default: 0 },
  hostedRooms: [{
    roomCode: String,
    title: String,
    gameMode: String,
    students: Number,
    date: { type: Date, default: Date.now },
    results: [{
        name: String,
        score: Number
    }]
  }],
  history: [{
    quizId: String,
    title: String,
    score: Number,
    date: { type: Date, default: Date.now }
  }],
  isSubscribed: { type: Boolean, default: false },
  subscriptionExpiry: { type: Date },
  lastTransactionId: { type: String },
  paidAt: { type: Date }
});

module.exports = mongoose.model('User', userSchema);
