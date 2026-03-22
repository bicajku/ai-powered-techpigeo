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
  user_id: number | null
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

// --- Brain Documents (source tracking) ---

export async function addBrainDocument(doc: {
  title: string
  source_url?: string
  source_type: BrainDocument["source_type"]
  created_by?: number
}): Promise<BrainDocument> {
  const sql = getNeonClient()
  const rows = await sql`
    INSERT INTO brain_documents (title, source_url, source_type, created_by)
    VALUES (${doc.title}, ${doc.source_url ?? null}, ${doc.source_type}, ${doc.created_by ?? null})
    RETURNING *
  `
  return rows[0] as BrainDocument
}

export async function listBrainDocuments(): Promise<BrainDocument[]> {
  const sql = getNeonClient()
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
  const sql = getNeonClient()
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
  const sql = getNeonClient()
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
  const sql = getNeonClient()
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
  return rows[0] as BrainEntry
}

export async function searchBrain(
  queryEmbedding: number[],
  limit = 5,
  sector?: string
): Promise<(BrainEntry & { similarity: number })[]> {
  const sql = getNeonClient()
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
  const sql = getNeonClient()
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
  user_id?: number
  query_text: string
  query_embedding?: number[]
  module?: string
  response_json?: Record<string, unknown>
  providers_used?: string[]
  brain_hits?: number
}): Promise<void> {
  const sql = getNeonClient()
  const embeddingStr = entry.query_embedding ? `[${entry.query_embedding.join(",")}]` : null

  await sql`
    INSERT INTO query_log (user_id, query_text, query_embedding, module, response_json, providers_used, brain_hits)
    VALUES (
      ${entry.user_id ?? null},
      ${entry.query_text},
      ${embeddingStr ? sql`${embeddingStr}::vector` : null},
      ${entry.module ?? null},
      ${entry.response_json ? JSON.stringify(entry.response_json) : null}::jsonb,
      ${entry.providers_used ?? null},
      ${entry.brain_hits ?? 0}
    )
  `
}

export async function getRecentQueries(userId?: number, limit = 20): Promise<QueryLogEntry[]> {
  const sql = getNeonClient()

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
  const sql = getNeonClient()
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
  const sql = getNeonClient()
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
