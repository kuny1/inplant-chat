import type { Document, Chunk } from "./loader.js";

export interface RetrieveResult {
  chunk: Chunk;
  document: Document;
  score: number;
}

/**
 * 简单中文分词：按常见分隔符切分 + 提取 2-3 字 n-gram
 * 不做词典分词，避免引入依赖。对「聚合反应釜温度过高」这种查询够用。
 */
function tokenize(text: string): string[] {
  // 去掉标点符号，按空格/换行/标点切分
  const cleaned = text
    .replace(/[，。！？、；：""''（）【】《》\s\n\r\t]+/g, " ")
    .trim();
  const segments = cleaned.split(" ").filter((s) => s.length > 0);

  const tokens = new Set<string>();

  for (const seg of segments) {
    // 整个词加入（2 字以上）
    if (seg.length >= 2) tokens.add(seg);
    // 2-gram
    for (let i = 0; i <= seg.length - 2; i++) {
      tokens.add(seg.slice(i, i + 2));
    }
    // 3-gram（对专业术语更敏感，如"反应釜""聚合釜"）
    for (let i = 0; i <= seg.length - 3; i++) {
      tokens.add(seg.slice(i, i + 3));
    }
  }

  return Array.from(tokens);
}

/**
 * 关键词匹配检索器
 *
 * ## 检索流程
 * 1. 将 query 分词为 tokens
 * 2. 遍历所有文档块，计算每个块的命中率：
 *    score = (命中 token 数 / query 总 token 数) × 标题奖励
 * 3. 标题奖励：如果 chunk 内容或其所属文档标题包含 query 完整原文，score × 1.5
 * 4. 按 score 降序，取 topK，过滤低于 threshold 的
 *
 * ## 为什么关键词够用（MVP 阶段）
 * - 5 篇文档、~50 个 chunks，搜索空间小
 * - 领域限定在「聚合反应釜」，查询词汇高度集中
 * - 用户问的是"温度过高怎么办"而非"thermal anomaly mitigation"——
 *   精确关键词匹配就是这个场景最有效的信号
 *
 * ## 扩展路径
 * EXTEND: 基础关键词 + BM25 词频逆文档频率加权，修正高频词的得分虚高
 * EXTEND: 语义 search → pgvector / embedding（参考 docs/data-design.md 的迁移路径）
 */
export function retrieve(
  query: string,
  documents: Document[],
  options: { topK?: number; threshold?: number } = {}
): RetrieveResult[] {
  const topK = options.topK ?? 3;
  const threshold = options.threshold ?? 0.1; // 关键词匹配的阈值比语义低

  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const scored: RetrieveResult[] = [];

  for (const doc of documents) {
    for (const chunk of doc.chunks) {
      const chunkLower = chunk.content.toLowerCase();
      const queryLower = query.toLowerCase();

      // 计算命中率
      let hits = 0;
      for (const token of queryTokens) {
        if (chunkLower.includes(token.toLowerCase())) {
          hits++;
        }
      }

      let score = hits / queryTokens.length;

      // 标题奖励：文档标题或 chunk 内容包含完整查询原文 → 加分
      if (
        doc.title.toLowerCase().includes(queryLower) ||
        chunkLower.includes(queryLower)
      ) {
        score = Math.min(1, score * 1.5);
      }

      // 领域词额外奖励：chunk 中包含「反应釜」「聚合」等核心词 → 轻度加分
      const domainBoosters = ["反应釜", "聚合", "搅拌", "夹套", "温度", "压力", "安全", "故障"];
      for (const booster of domainBoosters) {
        if (chunkLower.includes(booster)) {
          score = Math.min(1, score + 0.05);
        }
      }

      if (score >= threshold) {
        scored.push({ chunk, document: doc, score });
      }
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}
