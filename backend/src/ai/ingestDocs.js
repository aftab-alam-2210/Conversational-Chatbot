import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pdfParse from 'pdf-parse';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { OpenAIEmbeddings } from '@langchain/openai';
import { PineconeStore } from '@langchain/pinecone';
import { Pinecone } from '@pinecone-database/pinecone';
import { Document } from '@langchain/core/documents';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function cleanExtractedText(text) {
  if (!text) return '';
  // Fix spaced characters from presentation PDFs (e.g., "V V n T  S e Q u o r" -> "VVnT SeQuor")
  return text
    .replace(/(?:([a-zA-Z])\s){3,}([a-zA-Z])/g, (match) => match.replace(/\s+/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

export async function processPdfFiles() {
  const docsFolder = path.join(__dirname, 'knowledge', 'docs');
  if (!fs.existsSync(docsFolder)) {
    fs.mkdirSync(docsFolder, { recursive: true });
    console.log(`[Ingest] Created PDF documents folder at: ${docsFolder}`);
    return [];
  }

  const files = fs.readdirSync(docsFolder).filter(f => f.endsWith('.pdf'));
  console.log(`[Ingest] Found ${files.length} PDF file(s) in knowledge/docs.`);

  const pdfRecords = [];
  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 500,
    chunkOverlap: 80,
  });

  for (const file of files) {
    const filePath = path.join(docsFolder, file);
    try {
      console.log(`[Ingest] Processing PDF: ${file}...`);
      const dataBuffer = fs.readFileSync(filePath);
      const pdfData = await pdfParse(dataBuffer);

      const rawText = pdfData.text || '';
      const cleanedText = cleanExtractedText(rawText);

      const tempDoc = new Document({
        pageContent: cleanedText,
        metadata: { sourceFile: file, pageCount: pdfData.numpages },
      });

      const chunks = await textSplitter.splitDocuments([tempDoc]);
      console.log(`[Ingest] Chunked '${file}' (${pdfData.numpages} pages) into ${chunks.length} text chunks.`);

      chunks.forEach((chunk, index) => {
        const cleanDocName = file
          .replace('.pdf', '')
          .replace(/_/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        pdfRecords.push({
          id: `pdf-${file.replace(/[^a-zA-Z0-9]/g, '_')}-${index + 1}`,
          title: cleanDocName,
          category: 'Official Document',
          content: chunk.pageContent,
          sourceFile: file,
          chunkIndex: index + 1,
        });
      });
    } catch (err) {
      console.error(`[Ingest] Failed to parse PDF ${file}: ${err.message}`);
    }
  }

  return pdfRecords;
}

export async function runIngestion() {
  console.log('--- [VVnT SeQuor] Document & PDF Ingestion Pipeline Starting ---');

  // 1. Process Raw PDF Files into Vector Chunks
  const pdfChunks = await processPdfFiles();

  // 2. Load existing base JSON knowledge base
  const kbPath = path.join(__dirname, 'knowledge', 'vvnt_knowledge_base.json');
  let baseDocs = [];
  if (fs.existsSync(kbPath)) {
    try {
      const rawData = JSON.parse(fs.readFileSync(kbPath, 'utf-8'));
      // Filter out previous auto-generated PDF chunks to avoid duplicates
      baseDocs = rawData.filter((item) => !item.id?.startsWith('pdf-'));
    } catch (e) {
      console.warn(`[Ingest] Error reading base knowledge JSON: ${e.message}`);
    }
  }

  const combinedRecords = [...baseDocs, ...pdfChunks];
  fs.writeFileSync(kbPath, JSON.stringify(combinedRecords, null, 2), 'utf-8');
  console.log(`[Ingest] Saved ${combinedRecords.length} total records (${pdfChunks.length} PDF chunks) to vvnt_knowledge_base.json.`);

  // 3. Create LangChain Documents for Vector Indexing
  const docs = combinedRecords.map(
    (item) =>
      new Document({
        pageContent: `Title: ${item.title}\nCategory: ${item.category}\nContent: ${item.content}`,
        metadata: {
          id: item.id,
          title: item.title,
          category: item.category,
          sourceFile: item.sourceFile || 'JSON Knowledge Base',
          sourceType: item.sourceType || (item.sourceFile ? 'pdf' : 'curated'),
          sourceUrl: item.sourceUrl,
        },
      })
  );

  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 500,
    chunkOverlap: 80,
  });

  const finalChunkedDocs = await textSplitter.splitDocuments(docs);
  console.log(`[Ingest] Successfully prepared ${finalChunkedDocs.length} vector chunks for search store.`);

  // 4. Optionally sync with Pinecone if API keys exist
  const pineconeKey = process.env.PINECONE_API_KEY;
  const pineconeIndex = process.env.PINECONE_INDEX || 'vvnt-sequor-knowledge';
  const openAiKey = process.env.OPENAI_API_KEY;

  if (pineconeKey && pineconeKey !== 'your_pinecone_api_key_here' && openAiKey) {
    try {
      console.log(`Connecting to Pinecone Index: ${pineconeIndex}...`);
      const pinecone = new Pinecone({ apiKey: pineconeKey });
      const index = pinecone.Index(pineconeIndex);

      const embeddings = new OpenAIEmbeddings({
        openAIApiKey: openAiKey,
        modelName: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
      });

      await PineconeStore.fromDocuments(finalChunkedDocs, embeddings, {
        pineconeIndex: index,
        maxConcurrency: 5,
      });

      console.log(`[Success] Ingested ${finalChunkedDocs.length} chunks into Pinecone Vector Index.`);
    } catch (err) {
      console.error(`[Error] Pinecone ingestion failed: ${err.message}`);
    }
  } else {
    console.log('[Notice] Pinecone/OpenAI credentials not configured in .env. PDF Chunks are indexed and ready in Memory Vector Store.');
  }

  console.log('--- PDF Document Ingestion Pipeline Completed ---');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runIngestion().catch(console.error);
}
