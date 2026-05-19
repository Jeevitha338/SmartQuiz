const mongoose = require('mongoose');

const certificateSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  studentName: { type: String, required: true },
  quizId: { type: String }, // Can be roomCode or ObjectId
  quizTitle: { type: String },
  adminId: { type: String, required: true }, // Tracker for fresh admin logic
  score: { type: Number },
  gameMode: { type: String },
  approved: { type: Boolean, default: false },
  issuedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Certificate', certificateSchema);
