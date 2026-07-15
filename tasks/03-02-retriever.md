# T3.2 检索器

**状态**：✅ 已完成
**依赖**：T3.1（向量化后的文档）
**可并行**：否

## 产出文件

- `src/rag/retriever.ts`

## 实现要点

### 检索流程

```
输入: query 文本 + Document[]（含 embedding）+ options { topK, threshold }
输出: RetrieveResult[]（按相似度降序，最多 topK 条）

1. llm.embed([query]) → queryVector
2. 遍历所有 document.chunks:
     if chunk.embedding 存在:
       score = cosineSimilarity(queryVector, chunk.embedding)
       if score >= threshold → 加入候选集
3. 候选集按 score 降序排列
4. 返回前 topK 条
```

### 余弦相似度计算

```
cosineSimilarity(A, B):
  dot = Σ(A[i] * B[i])
  normA = √Σ(A[i]²)
  normB = √Σ(B[i]²)
  return dot / (normA * normB)
```

- 两个向量长度相等时，余弦值范围为 [-1, 1]
- embedding 向量已经归一化的情况下余弦值与内积等价，但这里显式计算保证普适性
- 分母为 0 时返回 0（空向量场景，理论上不应出现）

### 复杂度与扩展路径

| 阶段 | 数据量 | 方案 | 说明 |
|------|--------|------|------|
| 当前（MVP） | ~50 chunks | 内存暴力搜索 O(n) | 遍历所有 chunk 计算余弦相似度 |
| 中期 | >1000 chunks | pgvector ivfflat 索引 | `CREATE INDEX ... USING ivfflat (embedding vector_cosine_ops)`，查询用 `<=>` 余弦距离运算符 |
| 远期 | >10万 chunks | HNSW 索引 | pgvector 内置 HNSW 或独立向量库（Milvus/Qdrant），召回率和速度最优 |

### 混合检索扩展

注释预留：当前纯语义搜索可能遗漏精确关键词匹配。后续可改为加权混合：

```
finalScore = semanticScore * 0.7 + bm25Score * 0.3
```

BM25 对专业术语的精确匹配更敏感（如 "T-101" 这样的测点编号），语义搜索擅长同义词和语义相近的查询。

## 验收标准

- [x] 能根据查询返回相关文档块
- [x] 返回结果按相似度降序排列
- [x] 低于 threshold 的块被过滤
- [x] 注释包含 pgvector / HNSW 升级路径
