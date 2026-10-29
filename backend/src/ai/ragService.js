import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { Document } from '@langchain/core/documents';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { formatRAGPrompt } from './prompts/systemPrompt.js';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const identityQuestion = /\b(who (?:build|built|create|created|develop|developed|make|made) (?:you|this (?:chatbot|assistant))|who (?:is|was) (?:your|the) (?:developer|creator|builder)|who (?:is|was) the (?:developer|creator|builder) of (?:this )?(?:chatbot|assistant))\b/i;
const hiringQuestion = /\b(hir(?:e|ing)|vacanc(?:y|ies)|open positions?|openings?|job openings?|careers?|apply for (?:a )?job|recruit(?:ment|ing)?)\b/i;
const pageLinkRequest = /\b(?:page\s+link|link\s+to|link\s+for|website\s+link|web\s*page|url|page)\b/i;
const conversationEndQuery = (query = '') => /^\s*(?:(?:ok(?:ay)?|alright|please)[,\s]*)?(?:end|finish|close|stop|terminate)(?:\s+(?:(?:this|that|the|our|my)\s+)?(?:chat|conversation|voice|session|call|it|here|now))?\s*[.!?]*\s*$/i.test(query)
  || /\b(?:end|finish|close|stop|terminate)\s+(?:(?:this|the|our|my)\s+)?(?:chat|conversation|voice|session|call)\b/i.test(query)
  || /\b(?:thank(?:s| you)(?: very much)?|ok(?:ay)?\s+thank(?:s| you)?)\b[,.!\s]*(?:now\s+)?(?:you can\s+)?(?:end|finish|close|stop)\b/i.test(query)
  || /\b(?:end|finish|close|stop)\b.{0,40}\b(?:thank(?:s| you)|goodbye|bye)\b/i.test(query)
  || /\b(?:that's all|that is all|i'm done|i am done|we're done|we are done|goodbye|good bye|bye for now|see you later|that's enough|that is enough|i'm finished|i am finished|we can stop here)\b[.!\s]*$/i.test(query)
  || /^\s*(?:(?:ok(?:ay)?|alright)[,\s]*)?thank(?:s| you)(?: very much)?[.!?\s]*$/i.test(query);
const identityVerbs = ['build', 'built', 'create', 'created', 'develop', 'developed', 'make', 'made'];
const nameRecallQuestion = /\b(?:what(?:'s| is) my name|do you remember my name|what did i (?:tell|say)(?: you)? my name|who am i)\b/i;
const nameStatement = /\b(?:my name is|call me|i am|i'm)\s+([a-z][a-z'’-]*(?:\s+[a-z][a-z'’-]*){0,2})/i;
const personalIntroduction = /^\s*(?:my name is|call me|i am|i'm)\s+[a-z][a-z'’-]*(?:\s+[a-z][a-z'’-]*){0,2}[.!?\s]*$/i;
const NAME_STOP_WORDS = new Set(['a', 'an', 'the', 'from', 'at', 'in', 'looking', 'doing', 'interested', 'based', 'working', 'trying', 'fine', 'good', 'well', 'happy']);
const COMPANY_SCOPE_MESSAGE = "I'm sorry, I can help with VVnT SeQuor's services, solutions, and company information. Please share another VVnT-related question.";
const CLARIFICATION_MESSAGE = 'I can help with VVnT SeQuor services, solutions, clients, careers, contact details, cloud, AI, cybersecurity, accessibility, and compliance. Could you rephrase your question?';
const OFFICIAL_SERVICES_URL = 'https://vvntsequor.in/services.html';
const OFFICIAL_CONTACT_URL = 'https://vvntsequor.in/contact.html';
const solutionsQuestion = /\b(?:what|which|list|tell me (?:about )?)\b[^?]{0,60}\b(?:solutions?|services?|offerings?|capabilities?)\b|\b(?:solutions?|services?|offerings?|capabilities?)\s+(?:do|does)\b/i;
const specificServiceRequest = /\b(?:cyber(?:security)?|vapt|penetration|accessibility|wcag|privacy|gdpr|dpdpa|cloud|devops|devsecops|kubernetes|genai|agentic|ai testing|digital testing|architecture)\b/i;
const clientsQuestion = /\b(?:who|which)\b[^?]{0,50}\b(?:clients?|customers?)\b|\b(?:clients?|customers?)\s+(?:of|does|do|has|have)\b/i;
const contactQuestion = /\b(?:how|where|who)\b[^?]{0,50}\b(?:contact|reach|call|email|phone)\b|\b(?:contact|reach)\s+(?:the )?(?:company|vvnt|sequor)\b/i;
const clarificationQuestion = /\b(?:i (?:did not|didn't) understand|explain (?:that|it)?\s*(?:briefly|simply)?|simplify (?:that|it)?|make (?:that|it) (?:brief|simple)|what do you mean)\b/i;
const keyboardNoise = /\b(?:asdf(?:gh)?|qwer(?:ty)?|zxcv(?:bn)?|lorem\s+ipsum)\b/i;

const sourceForDocument = (doc, relevance = 1) => ({
  title: doc.title || 'Official VVnT SeQuor document',
  category: doc.category || 'Official Document',
  relevance,
  url: doc.sourceUrl || null,
});

const dedupeSources = (docs) => Array.from(new Map(docs.map((doc) => {
  const source = sourceForDocument(doc);
  return [source.url || `${source.title}:${source.category}`, source];
})).values());

const briefPreviousAnswer = (history = []) => {
  const previous = [...history].reverse().find((message) => message.sender === 'assistant' && typeof message.text === 'string' && message.text.trim());
  if (!previous) return null;
  const firstSentence = previous.text.trim().match(/[^.!?]+[.!?]+|[^.!?]+$/)?.[0]?.trim();
  return firstSentence ? { text: `In brief: ${firstSentence}`, sources: previous.sources || [] } : null;
};

const verifiedClientNames = (docs) => Array.from(new Set(docs
  .flatMap((doc) => (doc.content || '').split(/\r?\n/))
  .map((line) => line.match(/^\s*-\s*([^:]+):/)?.[1]?.trim())
  .filter(Boolean)));

const verifiedSolutionNames = (docs) => Array.from(new Set(docs
  .flatMap((doc) => Array.from((doc.content || '').matchAll(/Service\s+\d+\s+—\s*[^\n]+\n([^\n]+)/gi)))
  .map((match) => match[1].trim())
  .filter(Boolean)));

const findNameInHistory = (history = []) => {
  for (const message of history.slice(-50).reverse()) {
    if (message.sender !== 'user' || typeof message.text !== 'string') continue;
    const match = message.text.match(nameStatement);
    if (!match) continue;
    const words = match[1].trim().split(/\s+/);
    while (words.length && /^(?:and|but|because|today|here)$/i.test(words.at(-1))) words.pop();
    if (!words.length || NAME_STOP_WORDS.has(words[0].toLowerCase())) continue;
    return words.map((word) => `${word[0].toUpperCase()}${word.slice(1)}`).join(' ');
  }
  return null;
};

const withinEditDistanceOne = (left, right) => {
  if (Math.abs(left.length - right.length) > 1) return false;
  let leftIndex = 0;
  let rightIndex = 0;
  let edits = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (left.length > right.length) leftIndex += 1;
    else if (right.length > left.length) rightIndex += 1;
    else {
      leftIndex += 1;
      rightIndex += 1;
    }
  }
  if (leftIndex < left.length || rightIndex < right.length) edits += 1;
  return edits <= 1;
};

const isIdentityQuestion = (query = '') => {
  if (identityQuestion.test(query)) return true;
  const words = query.toLowerCase().split(/\W+/).filter(Boolean);
  if (words[0] !== 'who' || !words.some((word) => ['you', 'chatbot', 'assistant'].includes(word))) return false;
  return words.slice(1).some((word) => identityVerbs.some((verb) => withinEditDistanceOne(word, verb)));
};
const QUERY_CATEGORIES = {
  compensation: ['salary', 'stipend', 'compensation', 'pay', 'ctc', 'package', 'wage', 'intern'],
  careers: ['hire', 'hiring', 'vacancy', 'vacancies', 'opening', 'openings', 'career', 'careers', 'recruit', 'job', 'apply'],
  accessibility: ['accessibility', 'accessible', 'inclusive', 'wcag', 'vpat', 'acr', 'section 508', 'ada', 'assistive technology', 'screen reader'],
  cybersecurity: ['cybersecurity', 'cyber security', 'vapt', 'penetration testing', '3paa'],
  services: ['service', 'solution', 'solutions', 'capability', 'capabilities', 'cloud', 'devops', 'ai', 'software', 'testing'],
  clients: ['client', 'clients', 'project', 'projects', 'customer', 'customers', 'case study'],
  contact: ['contact', 'phone', 'email', 'address', 'office', 'location', 'call'],
  leadership: ['leader', 'leadership', 'founder', 'founders', 'advisor', 'director', 'management'],
  compliance: ['compliance', 'policy', 'policies', 'gdpr', 'dpdpa', 'iso', 'soc', 'audit'],
  technical: ['architecture', 'kubernetes', 'migration', 'api', 'integration', 'technical', 'technology', 'database'],
};
const GENERIC_TERMS = new Set(['about', 'company', 'could', 'describe', 'does', 'for', 'give', 'have', 'help', 'information', 'please', 'some', 'tell', 'that', 'the', 'their', 'them', 'there', 'this', 'what', 'which', 'with', 'would', 'your', 'services']);
const VECTOR_MIN_SIMILARITY = Number(process.env.RAG_MIN_SIMILARITY || 0.35);

export const analyzeKnowledgeQuery = (query = '') => {
  const normalized = query.toLowerCase();
  const tokens = normalized.split(/\W+/).filter((token) => token.length > 2 && !GENERIC_TERMS.has(token));
  const categoryScores = Object.entries(QUERY_CATEGORIES).map(([category, terms]) => [
    category,
    terms.reduce((score, term) => score + (normalized.includes(term) ? 1 : 0), 0),
  ]);
  categoryScores.sort((a, b) => b[1] - a[1]);
  const [category, categoryScore] = categoryScores[0] || ['general', 0];
  return {
    category: categoryScore > 0 ? category : 'general',
    categoryScore,
    tokens,
    requiresEvidence: categoryScore > 0 || isIdentityQuestion(query) || hiringQuestion.test(query),
  };
};

const documentText = (doc) => `${doc.title || ''} ${doc.category || ''} ${doc.content || ''}`.toLowerCase();
const documentCategory = (doc) => `${doc.title || ''} ${doc.category || ''}`.toLowerCase();
const COMPENSATION_TERMS = ['salary', 'stipend', 'compensation', 'pay', 'ctc', 'package', 'wage', 'remuneration'];
const CAREERS_SOURCE_URL = 'https://vvntsequor.in/careers.html';
const CURRENT_CAREERS_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const isCurrentCareersDoc = (doc) => {
  if (doc.sourceType !== 'website' || doc.category !== 'Careers' || doc.sourceUrl !== CAREERS_SOURCE_URL) return false;
  const fetchedAt = Date.parse(doc.fetchedAt || '');
  return Number.isFinite(fetchedAt) && Date.now() - fetchedAt <= CURRENT_CAREERS_MAX_AGE_MS;
};

const normalizeLinkQuery = (query = '') => query.toLowerCase()
  // Voice transcription can confuse the spoken word "compliance" with
  // "confidence". Correct it only when the user is explicitly asking for a page link.
  .replace(/\bself[-\s]+confidence\b/g, 'self-compliance')
  .replace(/\b(give|show|share|send|find|me|the|page|link|url|website|web|site|of|this|for|to|on|about|can|you|please|or|other|question|direct|official)\b/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const retrieveWebsitePageLinks = (rawDocs, query) => {
  const topic = normalizeLinkQuery(query);
  const topicTokens = topic.split(/\s+/).filter((token) => token.length > 2 && !GENERIC_TERMS.has(token));
  if (!topicTokens.length) return [];

  const byUrl = new Map();
  for (const doc of rawDocs) {
    if (doc.sourceType !== 'website' || !doc.sourceUrl) continue;
    const title = (doc.title || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const content = (doc.content || '').toLowerCase();
    const pathname = (() => {
      try { return new URL(doc.sourceUrl).pathname.toLowerCase(); } catch { return ''; }
    })();
    const slug = pathname.replace(/\.[a-z0-9]+$/i, '').replace(/[^a-z0-9]+/g, ' ').trim();
    const titleMatches = topicTokens.filter((token) => title.includes(token)).length;
    const contentMatches = topicTokens.filter((token) => content.includes(token)).length;
    const slugMatches = topicTokens.filter((token) => slug.includes(token)).length;
    // Match a requested page by its title or URL, not merely because the
    // topic appears somewhere in an unrelated long article.
    if (!titleMatches && !slugMatches) continue;
    const exactTitleMatch = topic && title.includes(topic);
    const isHomepage = pathname === '/' || pathname === '/index.html';
    const isEditorial = /\/(?:blog|knowledge-hub)\//.test(pathname);
    const isDirectTopicPage = topicTokens.length === 1 && pathname === `/${topicTokens[0]}.html`;
    const score = (exactTitleMatch ? 30 : 0)
      + titleMatches * 10
      + slugMatches * 12
      + Math.min(contentMatches, 3)
      + (isDirectTopicPage ? 18 : 0)
      - (isHomepage ? 24 : 0)
      - (isEditorial ? 16 : 0);
    const current = byUrl.get(doc.sourceUrl);
    if (!current || score > current.score) {
      byUrl.set(doc.sourceUrl, { doc, score, exactTitleMatch });
    }
  }

  const rankedPages = Array.from(byUrl.values()).sort((a, b) => b.score - a.score);
  return rankedPages.slice(0, 3)
    .map(({ doc, score, exactTitleMatch }) => ({
      title: doc.title,
      category: doc.category,
      relevance: exactTitleMatch ? 1 : Number(Math.min(0.99, score / 80).toFixed(3)),
      url: doc.sourceUrl,
    }));
};

const scoreLocalDocument = (doc, queryInfo) => {
  const contentText = (doc.content || '').toLowerCase();
  const metadataText = documentCategory(doc);
  const categoryTerms = QUERY_CATEGORIES[queryInfo.category] || [];
  let score = 0;
  let matchedTokens = 0;
  let metadataMatches = 0;
  for (const token of queryInfo.tokens) {
    let matched = false;
    if (contentText.includes(token)) { score += 3; matched = true; }
    if (metadataText.includes(token)) {
      score += 1.5;
      metadataMatches += 1;
      matched = true;
    }
    if (matched) matchedTokens += 1;
  }
  for (const term of categoryTerms) {
    if (metadataText.includes(term)) score += 1;
    if (contentText.includes(term)) score += 1.5;
  }
  return { score, matchedTokens, metadataMatches };
};

export class RAGService {
  constructor() {
    this.vectorStore = null;
    this.rawDocs = [];
    this.isInitialized = false;
    this.openAIKeys = (process.env.OPENAI_API_KEYS || process.env.OPENAI_API_KEY || '').split(',').map(k => k.trim()).filter(Boolean);
    this.openRouterKeys = (process.env.OPENROUTER_API_KEYS || process.env.OPENROUTER_API_KEY || '').split(',').map(k => k.trim()).filter(Boolean);
    this.disabledKeys = new Set();
    this.hasOpenAI = this.openAIKeys.length > 0;
    this.hasOpenRouter = this.openRouterKeys.length > 0;
  }

  async initialize() {
    if (this.isInitialized) return;

    try {
      // 1. Load Knowledge Base JSON
      const kbPath = path.join(__dirname, 'knowledge', 'vvnt_knowledge_base.json');
      if (fs.existsSync(kbPath)) {
        const rawData = fs.readFileSync(kbPath, 'utf-8');
        this.rawDocs = JSON.parse(rawData);
      }
      const websiteKbPath = path.join(__dirname, 'knowledge', 'website_knowledge_base.json');
      if (fs.existsSync(websiteKbPath)) {
        try {
          const websiteDocs = JSON.parse(fs.readFileSync(websiteKbPath, 'utf-8'));
          if (Array.isArray(websiteDocs)) this.rawDocs.push(...websiteDocs);
        } catch (error) {
          console.warn('[RAG] Website knowledge file could not be loaded; continuing with existing knowledge sources.');
        }
      }

      // 2. Prepare LangChain Documents
      const langchainDocs = this.rawDocs.map(
        (item) =>
          new Document({
            pageContent: `Title: ${item.title}\nCategory: ${item.category}\nContent: ${item.content}`,
            metadata: {
              id: item.id,
              title: item.title,
              category: item.category,
              pageType: item.pageType,
              sourceType: item.sourceType || (item.sourceFile ? 'pdf' : 'curated'),
              sourceUrl: item.sourceUrl,
              sourceFile: item.sourceFile,
              fetchedAt: item.fetchedAt,
            },
          })
      );

      // 3. Text Splitter for fine-grained chunking
      const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 500,
        chunkOverlap: 80,
      });
      const splitDocs = await splitter.splitDocuments(langchainDocs);

      // 4. Initialize Vector Store
      if (this.hasOpenAI) {
        let embeddingsInitialized = false;
        for (const key of this.openAIKeys) {
          try {
            const embeddings = new OpenAIEmbeddings({
              openAIApiKey: key,
              modelName: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
              maxRetries: 0,
              timeout: 3000,
            });
            this.vectorStore = await MemoryVectorStore.fromDocuments(splitDocs, embeddings);
            console.log(`[RAG] LangChain Vector Store initialized with ${splitDocs.length} chunks via OpenAI Embeddings.`);
            embeddingsInitialized = true;
            break; // Stop at first successful key
          } catch (e) {
            console.warn('[RAG] OpenAI embeddings failed. Disabling the current key.');
            this.disabledKeys.add(key);
          }
        }
        if (!embeddingsInitialized) {
          console.warn('[RAG] All OpenAI keys failed for Embeddings. Switched to fast local vector retriever.');
        }
      } else {
        console.log(`[RAG] Initialized in local semantic search mode (${splitDocs.length} chunks indexed). Add OPENAI_API_KEYS or OPENROUTER_API_KEYS in .env to enable hosted LLM generation.`);
      }

      this.isInitialized = true;
    } catch (err) {
      console.error('[RAG] Error initializing RAG Service:', err.message);
    }
  }

  async retrieveContext(query, topK = 4) {
    await this.initialize();
    const queryInfo = analyzeKnowledgeQuery(query);
    const serviceIntent = /\b(services?|offerings?|capabilities|what do you (?:do|offer)|what can you (?:do|help)|help me with)\b/i.test(query);
    const makeFocusedResult = (docs, category) => {
      const sources = dedupeSources(docs);
      return {
        contextText: docs.map((doc) => `Title: ${doc.title}\nCategory: ${doc.category}\nContent: ${doc.content}`).join('\n\n---\n\n'),
        sources,
        confidence: sources.length ? 1 : 0,
        evidenceFound: sources.length > 0,
        queryCategory: category,
      };
    };

    // Creator identity is not established by the public site. Hiring answers
    // may use only a recently fetched, official Careers page.
    if (isIdentityQuestion(query)) {
      return { contextText: '', sources: [], confidence: 0, evidenceFound: false, queryCategory: 'identity' };
    }
    if (hiringQuestion.test(query) && !this.rawDocs.some(isCurrentCareersDoc)) {
      return { contextText: '', sources: [], confidence: 0, evidenceFound: false, queryCategory: 'careers' };
    }
    if (solutionsQuestion.test(query) && !specificServiceRequest.test(query)) {
      return makeFocusedResult(this.rawDocs.filter((doc) => doc.sourceUrl === OFFICIAL_SERVICES_URL), 'solutions');
    }
    if (clientsQuestion.test(query)) {
      return makeFocusedResult(this.rawDocs.filter((doc) => doc.category === 'Clients & Portfolio'), 'clients');
    }
    if (contactQuestion.test(query)) {
      return makeFocusedResult(this.rawDocs.filter((doc) => doc.sourceUrl === OFFICIAL_CONTACT_URL), 'contact');
    }
    if (pageLinkRequest.test(query)) {
      const sources = retrieveWebsitePageLinks(this.rawDocs, query);
      return {
        contextText: sources.map((source) => `Title: ${source.title}\nCategory: ${source.category}\nOfficial page: ${source.url}`).join('\n\n---\n\n'),
        sources,
        confidence: sources.length ? sources[0].relevance : 0,
        evidenceFound: sources.length > 0,
        queryCategory: queryInfo.category,
      };
    }

    const cleanTitle = (rawTitle) => {
      if (!rawTitle) return 'Official Document';
      return rawTitle
        .replace(/^PDF Chunk \d+:\s*/i, '')
        .replace(/_/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    };

    if (this.vectorStore && this.hasOpenAI) {
      try {
        const metadataFilter = hiringQuestion.test(query)
          ? (document) => document.metadata?.category === 'Careers' && document.metadata?.sourceUrl === CAREERS_SOURCE_URL
          : queryInfo.category === 'accessibility'
          ? (document) => /accessibility|inclusive|wcag|vpat/i.test(`${document.metadata?.title || ''} ${document.metadata?.category || ''}`)
          : queryInfo.category === 'cybersecurity'
          ? (document) => /cybersecurity|vapt|security/i.test(`${document.metadata?.title || ''} ${document.metadata?.category || ''}`)
          : /\b(cybersecurity|cyber security|vapt|penetration testing)\b/i.test(query)
          ? (document) => /cybersecurity/i.test(`${document.metadata?.title || ''} ${document.metadata?.category || ''}`)
          : undefined;
        const scoredResults = await this.vectorStore.similaritySearchWithScore(query, Math.max(topK, 6), metadataFilter);
        const results = scoredResults
          .filter(([document, score]) => score >= VECTOR_MIN_SIMILARITY)
          .filter(([document]) => queryInfo.category !== 'accessibility' || /accessibility|inclusive|wcag|vpat/i.test(`${document.metadata?.title || ''} ${document.metadata?.category || ''}`))
          .filter(([document]) => queryInfo.category !== 'cybersecurity' || /cybersecurity|vapt|security/i.test(`${document.metadata?.title || ''} ${document.metadata?.category || ''}`))
          .filter(([document]) => !hiringQuestion.test(query) || (document.metadata?.category === 'Careers' && document.metadata?.sourceUrl === CAREERS_SOURCE_URL))
          .filter(([document]) => queryInfo.category !== 'compensation' || (
            COMPENSATION_TERMS.some((term) => document.pageContent.toLowerCase().includes(term))
            && (document.metadata?.sourceType !== 'website' || document.metadata?.category === 'Careers')
          ))
          .sort((a, b) => {
            const aServiceBoost = serviceIntent && a[0].metadata?.pageType === 'service_detail' ? 1 : 0;
            const bServiceBoost = serviceIntent && b[0].metadata?.pageType === 'service_detail' ? 1 : 0;
            return bServiceBoost - aServiceBoost || b[1] - a[1];
          })
          .slice(0, topK);
        const bestSimilarity = results[0]?.[1] || 0;
        const contextText = results.map(([d]) => d.pageContent).join('\n\n---\n\n');
        
        const rawSources = results.map(([d, score]) => ({
          title: cleanTitle(d.metadata?.title),
          category: d.metadata?.category || 'Official Document',
          relevance: Number(score.toFixed(3)),
          url: d.metadata?.sourceUrl || null,
        }));

        const uniqueMap = new Map();
        rawSources.forEach((s) => {
          if (!uniqueMap.has(s.title)) {
            uniqueMap.set(s.title, s);
          }
        });

        const confidence = Number(bestSimilarity.toFixed(3));
        return {
          contextText,
          sources: Array.from(uniqueMap.values()),
          confidence,
          evidenceFound: results.length > 0,
          queryCategory: queryInfo.category,
        };
      } catch (err) {
        console.warn('[RAG] Vector search error, falling back to keyword matcher:', err.message);
      }
    }

    // High-performance keyword & semantic relevance ranking fallback
    const candidateDocs = hiringQuestion.test(query)
      ? this.rawDocs.filter(isCurrentCareersDoc)
      : this.rawDocs;
    const scoredDocs = candidateDocs.map((doc) => {
      const relevance = scoreLocalDocument(doc, queryInfo);
      return {
        doc,
        ...relevance,
        score: relevance.score + (serviceIntent && doc.pageType === 'service_detail' ? 8 : 0),
      };
    });

    scoredDocs.sort((a, b) => b.score - a.score);
    const bestScore = scoredDocs[0]?.score || 0;
    const specificServiceTopic = queryInfo.category === 'services' && queryInfo.tokens.some((token) =>
      ['cyber', 'cybersecurity', 'vapt', 'penetration'].includes(token)
    );
    const specificTechnicalTopic = queryInfo.category === 'technical' && queryInfo.tokens.some((token) =>
      ['migration', 'kubernetes', 'architecture', 'api', 'database'].includes(token)
    );
    const technicalTopicTerms = queryInfo.tokens.filter((token) =>
      ['migration', 'kubernetes', 'architecture', 'api', 'database'].includes(token)
    );
    const topDocs = scoredDocs
      .filter((d) => d.score > 0 && d.score >= Math.max(1.5, bestScore * 0.65))
      .filter((d) => queryInfo.category !== 'accessibility' || /accessibility|inclusive|wcag|vpat/i.test(documentCategory(d.doc)))
      .filter((d) => queryInfo.category !== 'cybersecurity' || /cybersecurity|vapt|security/i.test(documentCategory(d.doc)))
      .filter((d) => !hiringQuestion.test(query) || isCurrentCareersDoc(d.doc))
      .filter((d) => queryInfo.category !== 'compensation' || (
        COMPENSATION_TERMS.some((term) => documentText(d.doc).includes(term))
        && (d.doc.sourceType !== 'website' || d.doc.category === 'Careers')
      ))
      .filter((d) => !specificServiceTopic || queryInfo.tokens.some((token) => documentCategory(d.doc).includes(token)))
      .filter((d) => !specificTechnicalTopic || technicalTopicTerms.some((token) => documentText(d.doc).includes(token)))
      .slice(0, Math.min(topK, 3));

    if (topDocs.length === 0) {
      return { contextText: '', sources: [], confidence: 0, evidenceFound: false, queryCategory: queryInfo.category };
    }

    const contextText = topDocs
      .map((d) => `Title: ${d.doc.title}\nCategory: ${d.doc.category}\nContent: ${d.doc.content}`)
      .join('\n\n---\n\n');

    const bestDoc = topDocs[0];
    const coverage = bestDoc.matchedTokens / Math.max(1, queryInfo.tokens.length);
    const metadataCoverage = Math.min(1, bestDoc.metadataMatches / 2);
    const confidence = Number(Math.min(1, hiringQuestion.test(query)
      ? Math.max(0.65, coverage * 0.6 + metadataCoverage * 0.4)
      : coverage * 0.6 + metadataCoverage * 0.4).toFixed(3));
    if (confidence < 0.3) {
      return { contextText: '', sources: [], confidence, evidenceFound: false, queryCategory: queryInfo.category };
    }
    const rawSources = topDocs.map((d) => ({
      title: cleanTitle(d.doc.title),
      category: d.doc.category,
      relevance: Number((d.score / Math.max(1, bestScore)).toFixed(3)),
      url: d.doc.sourceUrl || null,
    }));

    const uniqueMap = new Map();
    rawSources.forEach((s) => {
      if (!uniqueMap.has(s.title)) {
        uniqueMap.set(s.title, s);
      }
    });

    return {
      contextText,
      sources: Array.from(uniqueMap.values()),
      confidence,
      evidenceFound: confidence >= 0.3,
      queryCategory: queryInfo.category,
    };
  }

  async reloadKnowledgeBase() {
    this.vectorStore = null;
    this.rawDocs = [];
    this.isInitialized = false;
    await this.initialize();
  }

  async generateResponse({ query, history = [], onChunk = null }) {
    const queryInfo = analyzeKnowledgeQuery(query);
    if (personalIntroduction.test(query)) {
      return {
        text: COMPANY_SCOPE_MESSAGE,
        sources: [],
        confidence: 1,
        evidenceFound: false,
        queryCategory: 'off_topic',
      };
    }
    if (clarificationQuestion.test(query)) {
      const previous = briefPreviousAnswer(history);
      return previous
        ? { text: previous.text, sources: previous.sources, confidence: 1, evidenceFound: true, queryCategory: 'conversation_follow_up' }
        : { text: 'What would you like me to explain briefly? Please share the VVnT SeQuor topic or service.', sources: [], confidence: 0, evidenceFound: false, queryCategory: 'conversation_follow_up' };
    }
    if (keyboardNoise.test(query)) {
      return { text: CLARIFICATION_MESSAGE, sources: [], confidence: 1, evidenceFound: false, queryCategory: 'clarification' };
    }
    if (nameRecallQuestion.test(query)) {
      const name = findNameInHistory(history);
      return {
        text: name
          ? `You told me your name is ${name}.`
          : "I don't see you share your name earlier in this chat.",
        sources: [],
        confidence: name ? 1 : 0,
        evidenceFound: Boolean(name),
        queryCategory: 'conversation_context',
      };
    }
    await this.initialize();
    if (isIdentityQuestion(query)) {
      return { text: "I'm SeQuor AI, VVnT SeQuor's virtual assistant. The information available to me doesn't identify the individual who developed this chatbot.", sources: [], confidence: 0, evidenceFound: false, queryCategory: 'identity' };
    }
    const retrieval = await this.retrieveContext(query);
    const { contextText, sources } = retrieval;
    if (solutionsQuestion.test(query) && !specificServiceRequest.test(query)) {
      const names = verifiedSolutionNames(this.rawDocs.filter((doc) => doc.sourceUrl === OFFICIAL_SERVICES_URL));
      return names.length
        ? {
            text: `VVnT SeQuor offers these verified solutions: ${names.join('; ')}.`,
            sources,
            confidence: retrieval.confidence,
            evidenceFound: true,
            queryCategory: 'solutions',
          }
        : { text: "I couldn't verify the current VVnT SeQuor solutions list.", sources: [], confidence: 0, evidenceFound: false, queryCategory: 'solutions' };
    }
    if (clientsQuestion.test(query)) {
      const names = verifiedClientNames(this.rawDocs.filter((doc) => doc.category === 'Clients & Portfolio'));
      return names.length
        ? {
            text: `Verified VVnT SeQuor clients include ${names.join('; ')}.`,
            sources,
            confidence: retrieval.confidence,
            evidenceFound: true,
            queryCategory: 'clients',
          }
        : { text: 'I could not find a verified client list in the available VVnT SeQuor records.', sources: [], confidence: 0, evidenceFound: false, queryCategory: 'clients' };
    }
    if (contactQuestion.test(query)) {
      return {
        text: 'You can contact VVnT SeQuor at sales@vvntsequor.in or +91 88028 01739 / +91 98180 68547. The office is at Logix Technova, A-106, Plot No. 4, Sector 132, Noida-201304.',
        sources,
        confidence: retrieval.confidence,
        evidenceFound: retrieval.evidenceFound,
        queryCategory: 'contact',
      };
    }
    if (pageLinkRequest.test(query)) {
      if (sources.length) {
        const sourceText = sources.map((source) => `${source.title}: ${source.url}`).join('\n');
        return {
          text: `Here ${sources.length === 1 ? 'is' : 'are'} the matching official VVnT SeQuor page${sources.length === 1 ? '' : 's'}:\n${sourceText}`,
          sources,
          confidence: retrieval.confidence,
          evidenceFound: true,
          queryCategory: retrieval.queryCategory,
        };
      }
      return {
        text: 'I could not match that topic to a verified page on the VVnT SeQuor website. Try the product or service name, and I can look for its official page.',
        sources: [],
        confidence: 0,
        evidenceFound: false,
        queryCategory: retrieval.queryCategory,
      };
    }
    if (queryInfo.requiresEvidence && !retrieval.evidenceFound) {
      return {
        text: "I couldn't verify that information from the available VVnT SeQuor records.",
        sources: [],
        confidence: retrieval.confidence || 0,
        evidenceFound: false,
        queryCategory: retrieval.queryCategory,
      };
    }
    const prompt = formatRAGPrompt(query, contextText, history);

    if (this.hasOpenAI || this.hasOpenRouter) {
      try {
        const text = await this.generateWithFallback(prompt, onChunk);
        return { text, sources, confidence: retrieval.confidence, evidenceFound: retrieval.evidenceFound, queryCategory: retrieval.queryCategory };
      } catch (err) {
        console.error('[RAG] All AI providers failed:', err.message);
      }
    }

    // Intelligent Built-in Consultant Engine (when OpenAI API Key is pending)
    const fallbackResponse = this.buildLocalConsultantResponse(query, contextText);
    if (onChunk) {
      // Simulate smooth streaming for realistic UX
      const words = fallbackResponse.split(' ');
      for (const word of words) {
        onChunk(word + ' ');
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }

    return {
      text: fallbackResponse,
      sources,
      confidence: retrieval.confidence,
      evidenceFound: retrieval.evidenceFound,
      queryCategory: retrieval.queryCategory,
    };
  }

  async generateWithFallback(prompt, onChunk) {
    // 1. Try OpenAI keys (skip already disabled/exhausted keys)
    for (const key of this.openAIKeys) {
      if (this.disabledKeys.has(key)) continue;
      try {
        const model = new ChatOpenAI({
          openAIApiKey: key,
          modelName: process.env.OPENAI_MODEL || 'gpt-4o',
          temperature: 0.2,
          streaming: !!onChunk,
        });
        return await this.invokeModel(model, prompt, onChunk);
      } catch (err) {
        console.warn(`[RAG] An OpenAI provider request failed. Disabling the current key: ${err.message}`);
        this.disabledKeys.add(key);
      }
    }

    // 2. Try OpenRouter keys (skip already disabled/exhausted keys)
    for (const key of this.openRouterKeys) {
      if (this.disabledKeys.has(key)) continue;
      try {
        const model = new ChatOpenAI({
          openAIApiKey: key,
          modelName: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
          temperature: 0.2,
          streaming: !!onChunk,
        }, {
          baseURL: "https://openrouter.ai/api/v1",
          defaultHeaders: {
            "HTTP-Referer": "http://localhost:5173",
            "X-Title": "VVnT SeQuor Chatbot",
          }
        });
        return await this.invokeModel(model, prompt, onChunk);
      } catch (err) {
        console.warn(`[RAG] An OpenRouter provider request failed. Disabling the current key: ${err.message}`);
        this.disabledKeys.add(key);
      }
    }

    throw new Error('All configured AI providers and fallback keys failed or quota exceeded.');
  }

  async invokeModel(model, prompt, onChunk) {
    if (onChunk) {
      let fullText = '';
      const response = await model.invoke(prompt, {
        callbacks: [{
          handleLLMNewToken(token) {
            fullText += token;
            onChunk(token);
          },
        }],
      });
      return response.content || fullText;
    } else {
      const response = await model.invoke(prompt);
      return response.content;
    }
  }

  buildLocalConsultantResponse(query, context) {
    const q = query.toLowerCase();

    if (conversationEndQuery(query.trim())) {
      return "You're welcome! It was a pleasure chatting with you. Thanks for visiting VVnT SeQuor, and have a wonderful day. Goodbye!";
    }

    // Check for off-topic non-company queries (politics, general trivia, weather, etc.)
    const offTopicKeywords = [
      'president', 'prime minister', 'minister', 'capital of', 'weather', 'recipe',
      'cricket', 'football', 'movie', 'actor', 'actress', 'song', 'joke', 'tell me a story',
      'who won', 'population', 'math problem', 'solve this'
    ];

    if (offTopicKeywords.some(kw => q.includes(kw)) && !q.includes('vvnt') && !q.includes('sequor')) {
      return "I am **SeQuor AI**, the official virtual assistant for **VVnT SeQuor**.\n\nI am specialized exclusively in providing assistance regarding VVnT SeQuor's enterprise AI, cloud architecture, cybersecurity, app modernization, and managed IT services.\n\nHow can I assist you today with VVnT SeQuor's capabilities or solutions?";
    }

    if (/\b(hello|hi|hey|greetings)\b/i.test(q)) {
      return "Hello and welcome to **VVnT SeQuor**! I am your AI Technical Consultant. How can I assist you today with our Cloud Infrastructure, AI Solutions, Cybersecurity, or Managed IT Services?";
    }
    if (/\b(cloud|aws|azure|gcp|devops|devsecops)\b/i.test(q) && context) {
      return 'Yes. VVnT SeQuor works on cloud and DevOps engagements, including multi-cloud architecture, cloud migration, automation, Kubernetes and CI/CD, cloud security, and managed infrastructure support.';
    }
    if (/\b(cybersecurity|cyber security|vapt|penetration testing)\b/i.test(q) && context) {
      const content = context.match(/Content:\s*([\s\S]*?)(?:\n\n---|$)/)?.[1]?.trim();
      if (content && /vulnerability|penetration|3paa|vapt/i.test(context)) {
        return 'VVnT SeQuor offers Vulnerability Assessment and Penetration Testing (VAPT), Third-Party Assessment & Audits (3PAA), and related security assessments across applications, APIs, mobile, infrastructure, and cloud. Its official service page also describes DevSecOps integration and cloud security architecture reviews.';
      }
    }
    if (analyzeKnowledgeQuery(query).category === 'compensation' && context) {
      return 'The official careers page says internship stipends are confirmed individually during the application conversation; it does not publish a stipend amount. I could not verify full-time salary figures from the available information.';
    }
    if (hiringQuestion.test(query) && context) {
      const careersPageText = this.rawDocs
        .filter((doc) => isCurrentCareersDoc(doc))
        .map((doc) => doc.content)
        .join('\n');
      const openingsMatch = careersPageText.match(/(\d+)\s*(?:open roles|roles, open now)/i);
      const openings = openingsMatch?.[1];
      return openings
        ? `Yes. The official VVnT SeQuor Careers page currently lists ${openings} open roles. Check the linked Careers page for role details and application instructions; openings can change.`
        : 'The official VVnT SeQuor Careers page has current recruitment information. Please check the linked page for open roles and application instructions, as openings can change.';
    }
    if (analyzeKnowledgeQuery(query).category === 'accessibility' && /\b(services?|offerings?|capabilities|help me with|what do you offer)\b/i.test(q) && context) {
      return 'VVnT SeQuor offers accessibility assessment and remediation guidance against WCAG 2.1/2.2, Section 508, and ADA, along with VPAT/ACR preparation and assistive-technology usability testing. The official site says this work covers web, mobile, and SaaS products and is supported by an IAAP-certified accessibility team.';
    }
    if (/\b(contact|phone|email|address|location|office|call)\b/i.test(q)) {
      return "You can reach the **VVnT SeQuor** team directly:\n\n- **Office Address**: Logix Technova, IT Park, A-106 & 104, Sector 132, Expressway, Noida-201304 (Adjacent Adobe Building)\n- **Corporate Inquiry**: `sales@vvntsequor.in`\n- **Leadership Contacts**: `parveen.arora@vvnt.in` | `bhawna.narula@vvnt.in`\n- **Direct Connect**: `+91 88028 01739` | `+91 98180 68547` | `+91-120-3574106`\n- **Website**: [vvntsequor.in](https://www.vvntsequor.in)";
    }
    if (/\b(leadership|founder|founders|advisor|anil|gupta|parveen|arora|bhawna|narula)\b/i.test(q)) {
      return "**VVnT SeQuor Leadership Team & Key Advisors**:\n\n- **Mr. Anil Gupta** (Executive Advisor & Industry Veteran): 40+ years experience (NEC, HCL Technologies), IIT-Delhi B.Tech & Postgraduate Research Scholar from Univ of Tsukuba, Japan.\n- **Parveen Kumar Arora** (Founding Leader & Quality Security Expert): 24+ years experience in QA, Cloud Security, DevSecOps. Email: `parveen.arora@vvnt.in`\n- **Bhawna Narula** (Founding Leader & Enterprise Digital Transformation Leader): 26+ years experience in enterprise leadership, IT & HR Strategy, Digital Transformation. Email: `bhawna.narula@vvnt.in`";
    }

    if (!context) return "I couldn't find relevant verified information to answer that. Could you ask about a specific VVnT SeQuor service or topic?";
    const content = context.match(/Content:\s*([\s\S]*?)(?:\n\n---|$)/)?.[1]?.trim();
    if (content) {
      const sentences = content.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [content];
      return sentences.slice(0, 2).join(' ').trim();
    }
    return "I couldn't find enough relevant verified information to answer that.";
  }
}

export const ragService = new RAGService();
