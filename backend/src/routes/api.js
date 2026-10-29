import express from 'express';
import { handleChatMessage, handleChatStream, getSessionHistory } from '../controllers/chatController.js';
import { createLead, getLeads } from '../controllers/leadController.js';
import { getDBStatus } from '../config/db.js';
import { loginAdmin, logoutAdmin, getDashboardLeads, reingestPdfs, reingestWebsite } from '../controllers/adminController.js';
import { authenticateAdmin } from '../middleware/auth.js';
import { createLiveSession, retrieveLiveKnowledge, saveLiveTurn } from '../controllers/liveController.js';

const router = express.Router();

// Chat Endpoints
router.post('/chat', handleChatMessage);
router.post('/chat/stream', handleChatStream);
router.get('/chat/history/:sessionId', getSessionHistory);

// Gemini Live Voice Mode (isolated from the existing text chat contracts)
router.post('/live/session', createLiveSession);
router.post('/live/retrieve', retrieveLiveKnowledge);
router.post('/live/turn', saveLiveTurn);

// Lead Generation Endpoints
router.post('/leads', createLead);
router.get('/leads', getLeads); // Publicly accessible or protect? Let's leave as is for backward compatibility if used.

// Admin Endpoints
router.post('/admin/login', loginAdmin);
router.post('/admin/logout', logoutAdmin);
router.get('/admin/leads', authenticateAdmin, getDashboardLeads);
router.post('/admin/reingest-pdfs', authenticateAdmin, reingestPdfs);
router.post('/admin/reingest-website', authenticateAdmin, reingestWebsite);


// System Health & Diagnostics
router.get('/health', (req, res) => {
  const dbStatus = getDBStatus();
  res.status(200).json({
    status: 'online',
    service: 'VVnT SeQuor AI Gateway',
    timestamp: new Date().toISOString(),
    database: dbStatus,
    aiModel: process.env.OPENAI_MODEL || 'gpt-4o',
    environment: process.env.NODE_ENV || 'development',
  });
});

export default router;
