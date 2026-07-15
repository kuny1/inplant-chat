import type { LLMClient } from "../llm/client.js";
import type { Document, Chunk } from "./loader.js";

/**
 * 文档向量化服务
 *
 * 启动时调用一次，将所有文档块转为向量并缓存到内存。
 * 向量化后的文档供 retriever 进行语义搜索。
 *
 * ## 批量处理
 * 为减少 API 调用次数，chunk 按 batchSize 分批请求 embed API。
 * DeepSeek embedding API 单次最多支持 2048 个输入，这里保守取 batchSize=20。
 *
 * ## 增量支持
 * 跳过已有 embedding 的 chunk，支持文档热更新（只向量化新增块）。
 *
 * ## Embedding 模型
 * 使用 text-embedding-3-small（兼容 OpenAI 接口），输出 1536 维。
 * 对于 ~50 个 chunks 的场景完全够用。
 * EXTEND: 精度不足时切换 text-embedding-3-large（3072 维）。
 */
export async function embedDocuments(
  docs: Document[],
  llm: LLMClient,
  options: { batchSize?: number } = {}
): Promise<Document[]> {
  const batchSize = options.batchSize ?? 20;

  // 收集所有未向量化的 chunk
  const pending: { doc: Document; chunk: Chunk }[] = [];
  for (const doc of docs) {
    for (const chunk of doc.chunks) {
      if (!chunk.embedding) {
        pending.push({ doc, chunk });
      }
    }
  }

  if (pending.length === 0) return docs;

  // 分批请求 embedding
  for (let i = 0; i < pending.length; i += batchSize) {
    const batch = pending.slice(i, i + batchSize);
    const texts = batch.map((p) => p.chunk.content);
    const embeddings = await llm.embed(texts);

    for (let j = 0; j < batch.length; j++) {
      batch[j]!.chunk.embedding = embeddings[j]!;
    }
  }

  return docs;
}
