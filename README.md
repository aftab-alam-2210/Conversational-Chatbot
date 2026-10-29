# VVnT SeQuor Enterprise AI Chatbot Widget (MERN + LangChain RAG)

A production-ready, enterprise-grade AI Chatbot floating widget engineered for **VVnT SeQuor**. Built with React, Tailwind CSS, Framer Motion, Node.js/Express, MongoDB, and LangChain RAG with a configurable LLM provider.

---

## 🚀 Key Features

- **Retrieval-Augmented Generation (RAG)**: LangChain document indexing, chunking, and semantic vector retrieval for company services, cybersecurity SLAs, cloud capabilities, and IT support.
- **NLP Intent Classification**: Intelligently routes queries between RAG knowledge retrieval, consultation/lead capture, and human support handoff.
- **Streaming Response Support (SSE)**: Ultra-fast token-by-token streaming for responsive chat UX.
- **Resilient Persistence**: MongoDB session and lead storage with built-in in-memory fallback for immediate zero-config testing.
- **Enterprise Floating Widget**: Polished floating launcher, animated chat window, typing indicators, quick prompt chips, and integrated lead capture modal.
- **Voice controls**: Browser-supported speech recognition for dictating prompts and text-to-speech controls for assistant replies.
- **Live Voice Mode**: Bidirectional Gemini Live audio with interruption, server-issued ephemeral credentials, company knowledge retrieval, and a saved transcript.
- **Embeddable**: Simple `<script>` tag or iframe embedding for any website (WordPress, Webflow, Shopify, custom HTML).

---

## 🛠️ Tech Stack

- **Frontend**: React 18, Vite, Tailwind CSS, Framer Motion, Lucide React
- **Backend**: Node.js, Express.js, CORS, Dotenv
- **AI & RAG**: LangChain.js (`@langchain/openai`, `@langchain/core`), OpenAI-compatible LLM providers / embeddings, local keyword retrieval fallback, optional Pinecone integration, and Google's `@google/genai` SDK for Live session credentials
- **Database**: MongoDB (Mongoose)

---

## 📦 Installation & Setup

### 1. Install Dependencies
```bash
# Install root orchestration tooling
npm install

# Install backend dependencies
cd backend && npm install --legacy-peer-deps && cd ..

# Install frontend dependencies
cd frontend && npm install && cd ..
```

### 2. Configure Environment Variables
Edit `backend/.env` to configure your keys:
```env
PORT=5003
MONGODB_URI=mongodb://localhost:27017/vvnt_sequor_ai
OPENAI_API_KEYS=your_openai_api_key_here
OPENAI_MODEL=your-supported-model
PINECONE_API_KEY=your_pinecone_api_key_here
PINECONE_INDEX=vvnt-sequor-knowledge
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_LIVE_MODEL=gemini-3.8-live
LIVE_VOICE_ENABLED=true
LIVE_ALLOWED_ORIGINS=http://localhost:5173
```

`GEMINI_API_KEY` is used only by the backend to issue one-use, short-lived Live API tokens. Add the exact website origins that host the widget to `LIVE_ALLOWED_ORIGINS` as a comma-separated list. Live Voice Mode requires HTTPS in production (or localhost during development) and browser microphone permission. The existing text chat remains available without Gemini credentials. MongoDB remains optional; session history falls back to in-memory storage when it is unavailable.

Gemini Live ephemeral tokens and the SDK integration are currently documented by Google as experimental/preview features. Live API usage may incur charges based on audio and text tokens; check [Google's current Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing) before enabling it for production.

### 3. Run Ingestion Pipeline (Optional for Pinecone)
```bash
npm run ingest --prefix backend
npm run ingest:website --prefix backend
```

The PDF pipeline reads approved PDFs from `backend/src/ai/knowledge/docs/`. The website pipeline starts from `KB_WEBSITE_URL` (default `https://vvntsequor.in/`), reads its sitemap, and imports same-origin HTML pages only when permitted by that site's `robots.txt`. It stores these separately in `backend/src/ai/knowledge/website_knowledge_base.json`, preserving the curated JSON and PDF records. Run the relevant ingestion command again whenever the source content changes. An authenticated admin can refresh the configured website source with `POST /api/admin/reingest-website`.

### 4. Start the Application
Run both backend and frontend concurrently with one command:
```bash
npm run dev
```
- **Frontend App & Widget Showcase**: `http://localhost:5173`
- **Backend API & Health Status**: `http://localhost:5003/api/health`

---

## 🌐 Website Integration (WordPress / HTML)

To inject this widget into any external website, include the following script before the closing `</body>` tag:

```html
<!-- VVnT SeQuor AI Chatbot Widget -->
<script 
  src="http://localhost:5173/embed.js" 
  data-widget-url="http://localhost:5173/"
  data-server="http://localhost:5003"
  data-position="bottom-right"
  defer>
</script>
```

For production, set `data-widget-url` to the deployed frontend URL that serves the widget. The frontend host must also route `/api` to the backend (as Vite does in development), and its origin must be included in `LIVE_ALLOWED_ORIGINS` to use Live Voice Mode.
