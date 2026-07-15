import type { LLMClient } from "../llm/client.js";
import type { Document, Chunk } from "./loader.js";

export interface RetrieveResult {
  chunk: Chunk;
  document: Document;
  score: number;
}

/**
 * 余弦相似度
 * cos(θ) = (A · B) / (||A|| × ||B||)
 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * RAG 检索器 — 语义搜索
 *
 * ## 检索流程
 * 1. 将用户 query 向量化（调 LLM embed API）
 * 2. 与所有文档块的 embedding 计算余弦相似度
 * 3. 按相似度降序，取 topK
 * 4. 过滤低于 similarityThreshold 的结果
 *
 * ## 复杂度与扩展
 * - 当前: O(n) 暴力搜索，n = chunks 总数（~50），完全够用
 *
 * EXTEND: n > 1000 → pgvector ivfflat 索引
 *   CREATE INDEX ON chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
 *   SELECT *, 1 - (embedding <=> $1) AS score FROM chunks ORDER BY score DESC LIMIT $2;
 *
 * EXTEND: n > 100000 → HNSW（pgvector 或 Milvus/Qdrant）
 *   HNSW 在召回率和速度之间最优，但内存占用较高
 *
 * EXTEND: 混合检索 — 语义 0.7 + BM25 关键词 0.3
 *   纯语义搜索可能遗漏精确术语匹配，BM25 补充关键词召回
 */
export async function retrieve(
  query: string,
  documents: Document[],
  llm: LLMClient,
  options: { topK?: number; threshold?: number } = {}
): Promise<RetrieveResult[]> {
  const topK = options.topK ?? 3;
  const threshold = options.threshold ?? 0.5;

  // 1. 向量化查询
  const [queryEmbedding] = await llm.embed([query]);
  if (!queryEmbedding) return [];

  // 2. 计算所有 chunk 的相似度
  const scored: RetrieveResult[] = [];
  for (const doc of documents) {
    for (const chunk of doc.chunks) {
      if (!chunk.embedding) continue;
      const score = cosineSimilarity(queryEmbedding, chunk.embedding);
      if (score >= threshold) {
        scored.push({ chunk, document: doc, score });
      }
    }
  }

  // 3. 降序，取 topK
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}
