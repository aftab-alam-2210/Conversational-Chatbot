import mongoose from 'mongoose';

const MessageSchema = new mongoose.Schema(
  {
    sender: {
      type: String,
      enum: ['user', 'assistant', 'system'],
      required: true,
    },
    text: {
      type: String,
      required: true,
    },
    intent: {
      type: String,
      enum: ['faq', 'service_inquiry', 'lead_generation', 'human_handoff', 'general'],
      default: 'general',
    },
    sources: [
      {
        title: String,
        category: String,
        score: Number,
        relevance: Number,
        url: String,
      },
    ],
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const ChatSessionSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: String,
      default: null,
    },
    messages: [MessageSchema],
    metadata: {
      userAgent: String,
      ipAddress: String,
      referrer: String,
    },
    status: {
      type: String,
      enum: ['active', 'closed', 'escalated_to_human'],
      default: 'active',
    },
    lastActivity: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Fallback in-memory store if MongoDB is not connected
const memorySessions = new Map();

export const ChatSession = mongoose.models.ChatSession || mongoose.model('ChatSession', ChatSessionSchema);

export const SessionRepository = {
  async getOrCreateSession(sessionId, metadata = {}) {
    try {
      if (mongoose.connection.readyState === 1) {
        let session = await ChatSession.findOne({ sessionId });
        if (!session) {
          session = await ChatSession.create({
            sessionId,
            metadata,
            messages: [],
          });
        }
        return session;
      }
    } catch (err) {
      console.warn('[SessionRepository] Falling back to memory store:', err.message);
    }

    // Memory fallback
    if (!memorySessions.has(sessionId)) {
      memorySessions.set(sessionId, {
        sessionId,
        metadata,
        messages: [],
        status: 'active',
        lastActivity: new Date(),
      });
    }
    return memorySessions.get(sessionId);
  },

  async appendMessage(sessionId, message) {
    try {
      if (mongoose.connection.readyState === 1) {
        const session = await ChatSession.findOneAndUpdate(
          { sessionId },
          {
            $push: { messages: message },
            $set: { lastActivity: new Date() },
          },
          { new: true, upsert: true }
        );
        return session;
      }
    } catch (err) {
      console.warn('[SessionRepository] Error updating Mongo session:', err.message);
    }

    // Memory fallback
    const session = memorySessions.get(sessionId) || {
      sessionId,
      messages: [],
      status: 'active',
    };
    session.messages.push({ ...message, timestamp: new Date() });
    session.lastActivity = new Date();
    memorySessions.set(sessionId, session);
    return session;
  },

  async getSessionHistory(sessionId) {
    try {
      if (mongoose.connection.readyState === 1) {
        const session = await ChatSession.findOne({ sessionId });
        return session ? session.messages : [];
      }
    } catch (err) {
      console.warn('[SessionRepository] Error reading Mongo history:', err.message);
    }

    const session = memorySessions.get(sessionId);
    return session ? session.messages : [];
  },
};
