# T3.1 Embedding 服务

**状态**：✅ 完整实现
**依赖**：T2.1（LLM 客户端）, T2.3（文档加载器）
**可并行**：否（需等待 T2.1 和 T2.3）

## 产出文件

- `src/rag/embedder.ts`

## 实现内容

```typescript
import type { LLMClient } from "../llm/client.js";
import type { Document, Chunk } from "./loader.js";

/**
 * 文档向量化服务
 *
 * 启动时调用一次，将所有文档块转为向量并缓存到内存。
 * 向量化后的文档供 retriever 进行语义搜索。
 *
 * ## 批量处理
 * 为减少 API 调用次数，将 chunk 按 batchSize=20 分批请求 embed API。
 *
 * ## 增量支持
 * 跳过已有 embedding 的 chunk，支持文档热更新场景（只向量化新增块）。
 *
 * ## Embedding 模型选型
 * 使用 DeepSeek 的 text-embedding-3-small（兼容 OpenAI 接口），
 * 输出 1536 维向量。对于 5 篇文档 ~50 个 chunks 的场景完全够用。
 * 后续如需更高精度可切换为 text-embedding-3-large（3072 维）。
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

  // 批量请求 embedding
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
```

## 验收标准

- [ ] 能成功向量化所有文档块
- [ ] 每个 chunk.embedding 为 1536 维向量
- [ ] 批量请求减少 API 调用次数
- [ ] 跳过已有 embedding 的 chunk
