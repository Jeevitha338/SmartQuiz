const mongoose = require('mongoose');

const quizSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  topic: { type: String },
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  questions: [{
    questionText: String,
    type: { type: String, enum: ['mcq', 'text', 'true_false'], default: 'mcq' },
    options: [String],
    correctAnswer: String,
    timeLimit: { type: Number, default: 15 }
  }],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Quiz', quizSchema);
