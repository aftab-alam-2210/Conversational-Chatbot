/**
 * Advanced NLP Intent Classifier for VVnT SeQuor AI Chatbot.
 * Classifies user message into:
 * - 'human_handoff': User wants live agent/support rep
 * - 'lead_generation': User wants pricing, proposal, quote, or shares contact info
 * - 'faq': Service inquiries, technical details, general FAQs
 * - 'general': Casual greetings or generic conversational queries
 */

const HUMAN_HANDOFF_KEYWORDS = [
  'human', 'agent', 'representative', 'operator', 'talk to person',
  'speak with someone', 'manager', 'customer service rep', 'live support',
  'escalate', 'call me', 'phone call', 'real person'
];

const LEAD_GEN_KEYWORDS = [
  'pricing', 'quote', 'cost', 'proposal', 'hire', 'contract', 'consultation',
  'discovery call', 'demo', 'book a meeting', 'schedule', 'sales', 'budget',
  'estimate', 'rfp'
];

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_REGEX = /(?:(?:\+?1\s*(?:[.-]\s*)?)?(?:\(\s*([2-9]1[02-9]|[2-9][02-8]1|[2-9][02-8][02-9])\s*\)|([2-9]1[02-9]|[2-9][02-8]1|[2-9][02-8][02-9]))\s*(?:[.-]\s*)?)?([2-9]1[02-9]|[2-9][02-9]1|[2-9][02-8][02-9])\s*(?:[.-]\s*)?([0-9]{4})(?:\s*(?:#|x\.?|ext\.?|extension)\s*(\d+))?/g;

export const classifyIntent = (message = '') => {
  const cleanMsg = message.toLowerCase().trim();

  // Check if user is sharing email or phone directly
  const emails = cleanMsg.match(EMAIL_REGEX);
  const phones = cleanMsg.match(PHONE_REGEX);
  const extractedContact = {
    email: emails ? emails[0] : null,
    phone: phones ? phones[0] : null,
  };

  // Check for Human Handoff
  const isHumanHandoff = HUMAN_HANDOFF_KEYWORDS.some(kw => cleanMsg.includes(kw));
  if (isHumanHandoff) {
    return {
      intent: 'human_handoff',
      confidence: 0.95,
      extractedContact,
      triggerForm: true,
      action: 'escalate_to_human',
    };
  }

  // Check for Lead Generation
  const isLeadGen = LEAD_GEN_KEYWORDS.some(kw => cleanMsg.includes(kw)) || !!extractedContact.email;
  if (isLeadGen) {
    return {
      intent: 'lead_generation',
      confidence: 0.9,
      extractedContact,
      triggerForm: true,
      action: 'offer_consultation_form',
    };
  }

  // Check for General Greetings
  const greetings = ['hello', 'hi', 'hey', 'good morning', 'good evening', 'who are you'];
  if (greetings.some(g => cleanMsg === g || cleanMsg.startsWith(g + ' '))) {
    return {
      intent: 'general',
      confidence: 0.85,
      extractedContact,
      triggerForm: false,
      action: 'standard_chat',
    };
  }

  // Default to FAQ / Technical RAG
  return {
    intent: 'faq',
    confidence: 0.88,
    extractedContact,
    triggerForm: false,
    action: 'rag_search',
  };
};
