import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { LeadRepository } from '../models/Lead.js';

dotenv.config();

export const loginAdmin = (req, res) => {
  const { username, password } = req.body;
  const envUsername = process.env.ADMIN_USERNAME || 'admin';
  const envPassword = process.env.ADMIN_PASSWORD || 'vvntsequor_secure';

  if (username === envUsername && password === envPassword) {
    const token = jwt.sign({ role: 'admin', username }, process.env.JWT_SECRET, {
      expiresIn: '8h',
    });

    res.cookie('admin_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 8 * 60 * 60 * 1000, // 8 hours
    });

    return res.status(200).json({ success: true, message: 'Logged in successfully' });
  }

  return res.status(401).json({ success: false, error: 'Invalid credentials' });
};

export const logoutAdmin = (req, res) => {
  res.clearCookie('admin_token');
  return res.status(200).json({ success: true, message: 'Logged out successfully' });
};

export const getDashboardLeads = async (req, res) => {
  try {
    const leads = await LeadRepository.getLeads();
    return res.status(200).json({
      success: true,
      count: leads.length,
      leads,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to retrieve leads', details: error.message });
  }
};

export const reingestPdfs = async (req, res) => {
  try {
    const { runIngestion } = await import('../ai/ingestDocs.js');
    const { ragService } = await import('../ai/ragService.js');

    await runIngestion();
    await ragService.reloadKnowledgeBase();

    return res.status(200).json({
      success: true,
      message: 'PDF files successfully processed, chunked, and embedded into RAG Vector Store.',
      totalChunks: ragService.rawDocs.length,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to re-ingest PDF documents', details: error.message });
  }
};

export const reingestWebsite = async (_req, res) => {
  try {
    const { runWebsiteIngestion } = await import('../ai/websiteIngestion.js');
    const { ragService } = await import('../ai/ragService.js');
    const result = await runWebsiteIngestion();
    await ragService.reloadKnowledgeBase();

    return res.status(200).json({
      success: true,
      message: 'Official website pages refreshed in the RAG knowledge base.',
      totalPages: result.count,
      websiteChunks: result.chunkCount,
      totalKnowledgeRecords: ragService.rawDocs.length,
    });
  } catch (error) {
    return res.status(502).json({ success: false, error: 'Failed to refresh official website knowledge', details: error.message });
  }
};
