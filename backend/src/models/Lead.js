import mongoose from 'mongoose';

const LeadSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    company: {
      type: String,
      trim: true,
      default: '',
    },
    serviceInterest: {
      type: String,
      enum: [
        'Cloud Infrastructure & Migration',
        'Cybersecurity & Compliance',
        'AI & Enterprise Automation',
        'Managed IT Services & 24/7 NOC',
        'Custom Software Engineering',
        'General Consultation',
      ],
      default: 'General Consultation',
    },
    notes: {
      type: String,
      default: '',
    },
    sessionId: {
      type: String,
      index: true,
    },
    status: {
      type: String,
      enum: ['new', 'contacted', 'qualified', 'closed'],
      default: 'new',
    },
  },
  {
    timestamps: true,
  }
);

const memoryLeads = [];

export const Lead = mongoose.models.Lead || mongoose.model('Lead', LeadSchema);

export const LeadRepository = {
  async createLead(leadData) {
    try {
      if (mongoose.connection.readyState === 1) {
        const lead = await Lead.create(leadData);
        return lead;
      }
    } catch (err) {
      console.warn('[LeadRepository] Mongo save failed, saving to memory:', err.message);
    }

    const fallbackLead = {
      _id: `mem_${Date.now()}`,
      ...leadData,
      createdAt: new Date(),
      status: 'new',
    };
    memoryLeads.push(fallbackLead);
    return fallbackLead;
  },

  async getLeads() {
    try {
      if (mongoose.connection.readyState === 1) {
        return await Lead.find().sort({ createdAt: -1 });
      }
    } catch (err) {
      console.warn('[LeadRepository] Mongo query failed:', err.message);
    }
    return memoryLeads;
  },
};
