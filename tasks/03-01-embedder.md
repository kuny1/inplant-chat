# T3.1 Embedding 服务

**状态**：✅ 已完成
**依赖**：T2.1（LLM 客户端）, T2.3（文档加载器）
**可并行**：否（需等待 T2.1 和 T2.3）

## 产出文件

- `src/rag/embedder.ts`

## 实现要点

### 核心流程

```
输入: Document[]（chunks 已填充，embedding 为空）
输出: Document[]（chunks 的 embedding 已填充）

1. 收集所有 embedding 为空的 chunk → pending 列表
2. 按 batchSize=20 分批
3. 每批: 提取 chunk.content → llm.embed(texts) → 写回 chunk.embedding
4. 如果 pending 为空（全已向量化），直接返回
```

### 批量策略

- batchSize 取 20，保守估算，适配 DeepSeek embedding API（与 OpenAI 兼容，单次上限 2048 个输入）
- 减少 API 往返次数：50 个 chunk 只需 3 次 API 调用（20+20+10），而非 50 次
- 批量内某一项失败不影响同批其他项（写回时逐一下标对应）

### 增量支持

跳过 `chunk.embedding` 已有值的块。这为未来的文档热更新场景留了基础：新增文档时只向量化新增块，已有块不重复调 API。

### 设计决策

- **为什么不把 embedding 单独存（如向量数据库）？** MVP 只有 ~50 个 chunks，内存计算完全够。embedding 挂在 chunk 对象上让检索器可以直接遍历，不需要跨模块查向量库。当 chunks > 1000 时，将 embedding 迁移到 pgvector，chunk 上只保留 id 引用
- **为什么用 text-embedding-3-small 而非 large？** small 模型输出 1536 维，精度对 50 个 chunk 的检索完全够用；large 模型（3072 维）精度更高但 API 调用耗时和成本也更高，当前场景性价比不高

## 验收标准

- [x] 能成功向量化所有文档块
- [x] 每个 chunk.embedding 为 1536 维向量
- [x] 批量请求减少 API 调用次数
- [x] 跳过已有 embedding 的 chunk（增量）
