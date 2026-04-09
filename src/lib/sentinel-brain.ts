import { getNeonClient } from "./neon-client"

export interface BrainDocument {
  id: number
  title: string
  source_url: string | null
  source_type: "article" | "doc" | "github_repo" | "note" | "manual"
  status: "pending" | "processing" | "indexed" | "failed"
  chunks_count: number
  created_by: number | null
  created_at: string
}

export interface BrainEntry {
  id: number
  content: string
  sector: string | null
  metadata: Record<string, unknown> | null
  document_id: number | null
  chunk_index: number | null
  created_at: string
}

export interface QueryLogEntry {
  id: number
  user_id: string | null
  query_text: string
  module: string | null
  response_json: Record<string, unknown> | null
  providers_used: string[] | null
  brain_hits: number
  created_at: string
}

export interface CachedGeneration {
  id: number
  query_hash: string
  query_text: string
  provider: string
  response_json: Record<string, unknown>
  model_used: string | null
  hit_count: number
  created_at: string
  expires_at: string
}

let queryLogWritesDisabled = false

export interface ChatThread {
  id: number
  user_id: string | null
  module: string
  title: string
  status: "active" | "archived"
  created_at: string
  updated_at: string
}

export interface ChatMessage {
  id: number
  thread_id: number
  role: "user" | "assistant" | "system"
  content: string
  provider: string | null
  model_used: string | null
  providers_used: string[] | null
  brain_hits: number
  metadata: Record<string, unknown> | null
  created_at: string
}

export interface RetrievalTrace {
  id: number
  thread_id: number | null
  message_id: number | null
  query_text: string
  module: string | null
  provider: string | null
  model_used: string | null
  selected_chunks: Record<string, unknown>[]
  total_candidates: number
  avg_similarity: number | null
  retrieval_latency_ms: number | null
  generation_latency_ms: number | null
  created_at: string
}

// --- Database Initialization ---

export async function ensureBrainTables(): Promise<void> {
  const sql = await getNeonClient()

  // Enable pgvector extension (required for embedding columns)
  await sql`CREATE EXTENSION IF NOT EXISTS vector`

  await sql`
    CREATE TABLE IF NOT EXISTS brain_documents (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      source_url TEXT,
      source_type TEXT NOT NULL DEFAULT 'manual',
      status TEXT NOT NULL DEFAULT 'pending',
      chunks_count INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS sentinel_brain (
      id SERIAL PRIMARY KEY,
      content TEXT NOT NULL,
      embedding vector(768),
      sector TEXT,
      metadata JSONB,
      document_id INTEGER REFERENCES brain_documents(id) ON DELETE CASCADE,
      chunk_index INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS query_log (
      id SERIAL PRIMARY KEY,
      user_id TEXT,
      query_text TEXT NOT NULL,
      query_embedding vector(768),
      module TEXT,
      response_json JSONB,
      providers_used TEXT[],
      brain_hits INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS generation_cache (
      id SERIAL PRIMARY KEY,
      query_hash TEXT UNIQUE NOT NULL,
      query_text TEXT NOT NULL,
      provider TEXT NOT NULL,
      response_json JSONB NOT NULL,
      model_used TEXT,
      hit_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days')
    )
  `

  /* Migrate existing INTEGER query_log.user_id column to TEXT for UUID support */
  await sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'query_log' AND column_name = 'user_id' AND data_type = 'integer'
      ) THEN
        ALTER TABLE query_log ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;
      END IF;
    END $$
  `

  await sql`
    CREATE TABLE IF NOT EXISTS chat_threads (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT,
      module TEXT NOT NULL DEFAULT 'general',
      title TEXT NOT NULL DEFAULT 'New Chat',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `

  /* Migrate existing INTEGER user_id columns to TEXT for UUID support */
  await sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'chat_threads' AND column_name = 'user_id' AND data_type = 'integer'
      ) THEN
        ALTER TABLE chat_threads ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;
      END IF;
    END $$
  `

  await sql`
    CREATE INDEX IF NOT EXISTS idx_chat_threads_user_updated
    ON chat_threads (user_id, updated_at DESC)
  `

  await sql`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id BIGSERIAL PRIMARY KEY,
      thread_id BIGINT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      provider TEXT,
      model_used TEXT,
      providers_used TEXT[],
      brain_hits INTEGER NOT NULL DEFAULT 0,
      metadata JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `

  await sql`
    CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_created
    ON chat_messages (thread_id, created_at ASC)
  `

  await sql`
    CREATE TABLE IF NOT EXISTS retrieval_traces (
      id BIGSERIAL PRIMARY KEY,
      thread_id BIGINT REFERENCES chat_threads(id) ON DELETE SET NULL,
      message_id BIGINT REFERENCES chat_messages(id) ON DELETE SET NULL,
      query_text TEXT NOT NULL,
      module TEXT,
      provider TEXT,
      model_used TEXT,
      selected_chunks JSONB NOT NULL DEFAULT '[]'::jsonb,
      total_candidates INTEGER NOT NULL DEFAULT 0,
      avg_similarity DOUBLE PRECISION,
      retrieval_latency_ms INTEGER,
      generation_latency_ms INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `

  await sql`
    CREATE INDEX IF NOT EXISTS idx_retrieval_traces_thread_created
    ON retrieval_traces (thread_id, created_at DESC)
  `
}

// --- Brain Documents (source tracking) ---

export async function addBrainDocument(doc: {
  title: string
  source_url?: string
  source_type: BrainDocument["source_type"]
  created_by?: number
}): Promise<BrainDocument> {
  const sql = await getNeonClient()
  const rows = await sql`
    INSERT INTO brain_documents (title, source_url, source_type, created_by)
    VALUES (${doc.title}, ${doc.source_url ?? null}, ${doc.source_type}, ${doc.created_by ?? null})
    RETURNING *
  `
  const rowsArray = Array.isArray(rows) ? rows : []
  return rowsArray[0] as BrainDocument
}

export async function listBrainDocuments(): Promise<BrainDocument[]> {
  const sql = await getNeonClient()
  const rows = await sql`
    SELECT * FROM brain_documents ORDER BY created_at DESC
  `
  return rows as BrainDocument[]
}

export async function updateDocumentStatus(
  id: number,
  status: BrainDocument["status"],
  chunksCount?: number
): Promise<void> {
  const sql = await getNeonClient()
  if (chunksCount !== undefined) {
    await sql`
      UPDATE brain_documents SET status = ${status}, chunks_count = ${chunksCount} WHERE id = ${id}
    `
  } else {
    await sql`
      UPDATE brain_documents SET status = ${status} WHERE id = ${id}
    `
  }
}

export async function deleteBrainDocument(id: number): Promise<void> {
  const sql = await getNeonClient()
  await sql`DELETE FROM sentinel_brain WHERE document_id = ${id}`
  await sql`DELETE FROM brain_documents WHERE id = ${id}`
}

// --- Sentinel Brain (knowledge chunks) ---

export async function addBrainChunk(chunk: {
  content: string
  embedding: number[]
  sector?: string
  metadata?: Record<string, unknown>
  document_id?: number
  chunk_index?: number
}): Promise<BrainEntry> {
  const sql = await getNeonClient()
  const embeddingStr = `[${chunk.embedding.join(",")}]`
  const rows = await sql`
    INSERT INTO sentinel_brain (content, embedding, sector, metadata, document_id, chunk_index)
    VALUES (
      ${chunk.content},
      ${embeddingStr}::vector,
      ${chunk.sector ?? null},
      ${chunk.metadata ? JSON.stringify(chunk.metadata) : null}::jsonb,
      ${chunk.document_id ?? null},
      ${chunk.chunk_index ?? null}
    )
    RETURNING *
  `
  const rowsArray = Array.isArray(rows) ? rows : []
  return rowsArray[0] as BrainEntry
}

export async function searchBrain(
  queryEmbedding: number[],
  limit = 5,
  sector?: string
): Promise<(BrainEntry & { similarity: number })[]> {
  const sql = await getNeonClient()
  const embeddingStr = `[${queryEmbedding.join(",")}]`

  if (sector) {
    const rows = await sql`
      SELECT *, 1 - (embedding <=> ${embeddingStr}::vector) AS similarity
      FROM sentinel_brain
      WHERE sector = ${sector}
      ORDER BY embedding <=> ${embeddingStr}::vector
      LIMIT ${limit}
    `
    return rows as (BrainEntry & { similarity: number })[]
  }

  const rows = await sql`
    SELECT *, 1 - (embedding <=> ${embeddingStr}::vector) AS similarity
    FROM sentinel_brain
    ORDER BY embedding <=> ${embeddingStr}::vector
    LIMIT ${limit}
  `
  return rows as (BrainEntry & { similarity: number })[]
}

export async function getBrainStats(): Promise<{
  totalChunks: number
  totalDocuments: number
  sectors: string[]
}> {
  const sql = await getNeonClient()
  const [chunkResult] = await sql`SELECT COUNT(*) as count FROM sentinel_brain` as Record<string, unknown>[]
  const [docResult] = await sql`SELECT COUNT(*) as count FROM brain_documents` as Record<string, unknown>[]
  const sectorRows = await sql`SELECT DISTINCT sector FROM sentinel_brain WHERE sector IS NOT NULL` as Record<string, unknown>[]

  return {
    totalChunks: Number(chunkResult.count),
    totalDocuments: Number(docResult.count),
    sectors: sectorRows.map((r) => r.sector as string),
  }
}

// --- Query Log ---

export async function logQuery(entry: {
  user_id?: string | number
  query_text: string
  query_embedding?: number[]
  module?: string
  response_json?: Record<string, unknown>
  providers_used?: string[]
  brain_hits?: number
}): Promise<void> {
  if (queryLogWritesDisabled) return

  const sql = await getNeonClient()
  const embeddingStr = entry.query_embedding ? `[${entry.query_embedding.join(",")}]` : null

  try {
    await sql`
      INSERT INTO query_log (user_id, query_text, query_embedding, module, response_json, providers_used, brain_hits)
      VALUES (
        ${entry.user_id != null ? String(entry.user_id) : null},
        ${entry.query_text},
        ${embeddingStr ? sql`${embeddingStr}::vector` : null},
        ${entry.module ?? null},
        ${entry.response_json ? JSON.stringify(entry.response_json) : null}::jsonb,
        ${entry.providers_used ?? null},
        ${entry.brain_hits ?? 0}
      )
    `
  } catch (err) {
    // Backward compatibility fallback if an old deployment still has INTEGER user_id.
    const message = err instanceof Error ? err.message.toLowerCase() : ""
    const userIdTypeError =
      message.includes("query_log") &&
      (message.includes("invalid input syntax") || message.includes("type integer"))

    if (!userIdTypeError) {
      queryLogWritesDisabled = true
      console.warn("Query log writes disabled for this session due to DB error:", err)
      return
    }

    try {
      await sql`
        INSERT INTO query_log (user_id, query_text, query_embedding, module, response_json, providers_used, brain_hits)
        VALUES (
          ${null},
          ${entry.query_text},
          ${embeddingStr ? sql`${embeddingStr}::vector` : null},
          ${entry.module ?? null},
          ${entry.response_json ? JSON.stringify(entry.response_json) : null}::jsonb,
          ${entry.providers_used ?? null},
          ${entry.brain_hits ?? 0}
        )
      `
    } catch (fallbackErr) {
      queryLogWritesDisabled = true
      console.warn("Query log writes disabled for this session (fallback failed):", fallbackErr)
    }
  }
}

export async function getRecentQueries(userId?: number, limit = 20): Promise<QueryLogEntry[]> {
  const sql = await getNeonClient()

  if (userId) {
    const rows = await sql`
      SELECT * FROM query_log WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT ${limit}
    `
    return rows as QueryLogEntry[]
  }

  const rows = await sql`
    SELECT * FROM query_log ORDER BY created_at DESC LIMIT ${limit}
  `
  return rows as QueryLogEntry[]
}

// --- Chat Threads ---

export async function createChatThread(entry?: {
  user_id?: string
  module?: string
  title?: string
  status?: ChatThread["status"]
}): Promise<ChatThread> {
  const sql = await getNeonClient()
  const rows = await sql`
    INSERT INTO chat_threads (user_id, module, title, status)
    VALUES (
      ${entry?.user_id ?? null},
      ${entry?.module ?? "general"},
      ${entry?.title ?? "New Chat"},
      ${entry?.status ?? "active"}
    )
    RETURNING *
  `
  const rowsArray = Array.isArray(rows) ? rows : []
  return rowsArray[0] as ChatThread
}

export async function listChatThreads(options?: {
  user_id?: string
  module?: string
  status?: ChatThread["status"]
  limit?: number
}): Promise<ChatThread[]> {
  const sql = await getNeonClient()
  const limit = options?.limit ?? 50

  const rows = await sql`
    SELECT *
    FROM chat_threads
    WHERE (${options?.user_id ?? null}::text IS NULL OR user_id = ${options?.user_id ?? null})
      AND (${options?.module ?? null}::text IS NULL OR module = ${options?.module ?? null})
      AND (${options?.status ?? null}::text IS NULL OR status = ${options?.status ?? null})
    ORDER BY updated_at DESC
    LIMIT ${limit}
  `

  return rows as ChatThread[]
}

export async function updateChatThread(
  id: number,
  updates: { title?: string; status?: ChatThread["status"]; module?: string }
): Promise<ChatThread | null> {
  const sql = await getNeonClient()
  const rows = await sql`
    UPDATE chat_threads
    SET
      title = COALESCE(${updates.title ?? null}, title),
      status = COALESCE(${updates.status ?? null}, status),
      module = COALESCE(${updates.module ?? null}, module),
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `

  const rowsArray = Array.isArray(rows) ? rows : []
  return rowsArray[0] ? (rowsArray[0] as ChatThread) : null
}

export async function deleteChatThread(id: number, userId?: string): Promise<boolean> {
  const sql = await getNeonClient()
  const rows = await sql`
    DELETE FROM chat_threads
    WHERE id = ${id}
      AND (${userId ?? null}::text IS NULL OR user_id = ${userId ?? null})
    RETURNING id
  `
  const rowsArray = Array.isArray(rows) ? rows : []
  return rowsArray.length > 0
}

export async function autoTitleThreadFromFirstMessage(
  threadId: number,
  firstMessage: string
): Promise<void> {
  const sql = await getNeonClient()
  const normalized = firstMessage.trim().replace(/\s+/g, " ")
  if (!normalized) return

  const maxLen = 72
  const title = normalized.length > maxLen ? `${normalized.slice(0, maxLen - 3)}...` : normalized

  await sql`
    UPDATE chat_threads
    SET title = ${title}, updated_at = NOW()
    WHERE id = ${threadId} AND title = 'New Chat'
  `
}

// --- Chat Messages ---

export async function appendChatMessage(entry: {
  thread_id: number
  role: ChatMessage["role"]
  content: string
  provider?: string
  model_used?: string
  providers_used?: string[]
  brain_hits?: number
  metadata?: Record<string, unknown>
}): Promise<ChatMessage> {
  const sql = await getNeonClient()
  const rows = await sql`
    INSERT INTO chat_messages (
      thread_id,
      role,
      content,
      provider,
      model_used,
      providers_used,
      brain_hits,
      metadata
    )
    VALUES (
      ${entry.thread_id},
      ${entry.role},
      ${entry.content},
      ${entry.provider ?? null},
      ${entry.model_used ?? null},
      ${entry.providers_used ?? null},
      ${entry.brain_hits ?? 0},
      ${entry.metadata ? JSON.stringify(entry.metadata) : null}::jsonb
    )
    RETURNING *
  `

  await sql`
    UPDATE chat_threads
    SET updated_at = NOW()
    WHERE id = ${entry.thread_id}
  `

  const rowsArray = Array.isArray(rows) ? rows : []
  return rowsArray[0] as ChatMessage
}

export async function listChatMessages(threadId: number, limit = 200): Promise<ChatMessage[]> {
  const sql = await getNeonClient()
  const rows = await sql`
    SELECT *
    FROM chat_messages
    WHERE thread_id = ${threadId}
    ORDER BY created_at ASC
    LIMIT ${limit}
  `
  return rows as ChatMessage[]
}

// --- Retrieval Traces ---

export async function storeRetrievalTrace(entry: {
  thread_id?: number
  message_id?: number
  query_text: string
  module?: string
  provider?: string
  model_used?: string
  selected_chunks?: Record<string, unknown>[]
  total_candidates?: number
  avg_similarity?: number
  retrieval_latency_ms?: number
  generation_latency_ms?: number
}): Promise<RetrievalTrace> {
  const sql = await getNeonClient()
  const rows = await sql`
    INSERT INTO retrieval_traces (
      thread_id,
      message_id,
      query_text,
      module,
      provider,
      model_used,
      selected_chunks,
      total_candidates,
      avg_similarity,
      retrieval_latency_ms,
      generation_latency_ms
    )
    VALUES (
      ${entry.thread_id ?? null},
      ${entry.message_id ?? null},
      ${entry.query_text},
      ${entry.module ?? null},
      ${entry.provider ?? null},
      ${entry.model_used ?? null},
      ${JSON.stringify(entry.selected_chunks ?? [])}::jsonb,
      ${entry.total_candidates ?? 0},
      ${entry.avg_similarity ?? null},
      ${entry.retrieval_latency_ms ?? null},
      ${entry.generation_latency_ms ?? null}
    )
    RETURNING *
  `

  const rowsArray = Array.isArray(rows) ? rows : []
  return rowsArray[0] as RetrievalTrace
}

export async function listRetrievalTracesByThread(
  threadId: number,
  limit = 100
): Promise<RetrievalTrace[]> {
  const sql = await getNeonClient()
  const rows = await sql`
    SELECT *
    FROM retrieval_traces
    WHERE thread_id = ${threadId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `
  return rows as RetrievalTrace[]
}

export async function listRetrievalTracesByMessageId(
  messageId: number,
  limit = 10
): Promise<RetrievalTrace[]> {
  const sql = await getNeonClient()
  const rows = await sql`
    SELECT *
    FROM retrieval_traces
    WHERE message_id = ${messageId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `
  return rows as RetrievalTrace[]
}

export async function listRetrievalTraceByMessageId(
  messageId: number
): Promise<RetrievalTrace | null> {
  const rows = await listRetrievalTracesByMessageId(messageId, 1)
  return rows[0] ?? null
}

// --- Generation Cache ---

function hashQuery(text: string): string {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, " ")
  let hash = 0
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i)
    hash = ((hash << 5) - hash + char) | 0
  }
  return `q_${Math.abs(hash).toString(36)}_${normalized.length}`
}

export async function getCachedGeneration(queryText: string): Promise<CachedGeneration | null> {
  const sql = await getNeonClient()
  const qHash = hashQuery(queryText)

  const rows = await sql`
    SELECT * FROM generation_cache
    WHERE query_hash = ${qHash} AND expires_at > NOW()
    LIMIT 1
  ` as Record<string, unknown>[]

  if (rows.length > 0) {
    await sql`UPDATE generation_cache SET hit_count = hit_count + 1 WHERE id = ${rows[0].id}`
    return rows[0] as unknown as CachedGeneration
  }

  return null
}

export async function cacheGeneration(entry: {
  query_text: string
  provider: string
  response_json: Record<string, unknown>
  model_used?: string
}): Promise<void> {
  const sql = await getNeonClient()
  const qHash = hashQuery(entry.query_text)

  await sql`
    INSERT INTO generation_cache (query_hash, query_text, provider, response_json, model_used)
    VALUES (
      ${qHash},
      ${entry.query_text},
      ${entry.provider},
      ${JSON.stringify(entry.response_json)}::jsonb,
      ${entry.model_used ?? null}
    )
    ON CONFLICT (query_hash) DO UPDATE SET
      response_json = ${JSON.stringify(entry.response_json)}::jsonb,
      provider = ${entry.provider},
      model_used = ${entry.model_used ?? null},
      created_at = NOW(),
      expires_at = NOW() + INTERVAL '30 days'
  `
}
