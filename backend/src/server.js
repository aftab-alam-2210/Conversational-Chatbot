import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import apiRoutes from './routes/api.js';
import { connectDB } from './config/db.js';
import { ragService } from './ai/ragService.js';

import cookieParser from 'cookie-parser';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5003;

// Security & Middleware
app.use(
  cors({
    origin: (origin, callback) => callback(null, origin || true), // Allow specific origin dynamically for credentials
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

app.use(cookieParser());

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Request Logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[HTTP] ${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`);
  });
  next();
});

// API Routes
app.use('/api', apiRoutes);

// Root Welcome Route
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to VVnT SeQuor Enterprise AI Chatbot API',
    documentation: '/api/health',
    status: 'running',
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Unhandled Server Error]:', err);
  res.status(err.status || 500).json({
    error: 'Internal Server Error',
    message: err.message || 'Something went wrong on the server.',
  });
});

// Bootstrap Server
const startServer = async () => {
  try {
    // 1. Connect Database
    await connectDB();

    // 2. Pre-warm RAG Index
    await ragService.initialize();

    // 3. Start Listening
    app.listen(PORT, () => {
      console.log(`\n======================================================`);
      console.log(`  VVnT SeQuor AI Backend Running on port ${PORT}`);
      console.log(`  Health Check: http://localhost:${PORT}/api/health`);
      console.log(`  Chat Endpoint: http://localhost:${PORT}/api/chat`);
      console.log(`======================================================\n`);
    });
  } catch (error) {
    console.error('Fatal error during server startup:', error);
    process.exit(1);
  }
};

startServer();
