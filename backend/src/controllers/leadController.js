import { LeadRepository } from '../models/Lead.js';

export const createLead = async (req, res) => {
  try {
    const { name, email, phone, company, serviceInterest, notes, sessionId } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required to schedule a consultation.' });
    }

    const lead = await LeadRepository.createLead({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone ? phone.trim() : '',
      company: company ? company.trim() : '',
      serviceInterest: serviceInterest || 'General Consultation',
      notes: notes || '',
      sessionId: sessionId || '',
    });

    console.log(`[LeadController] New Lead Captured: ${lead.name} (${lead.email}) - Interest: ${lead.serviceInterest}`);

    return res.status(201).json({
      success: true,
      message: 'Thank you! A VVnT SeQuor senior solutions architect will contact you shortly.',
      lead,
    });
  } catch (error) {
    console.error('[LeadController] Error saving lead:', error);
    return res.status(500).json({ error: 'Failed to submit contact information.', details: error.message });
  }
};

export const getLeads = async (req, res) => {
  try {
    const leads = await LeadRepository.getLeads();
    return res.status(200).json({
      success: true,
      count: leads.length,
      leads,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to retrieve leads.', details: error.message });
  }
};
