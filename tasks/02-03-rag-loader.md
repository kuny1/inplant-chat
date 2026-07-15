# T2.3 RAG 文档加载器

**状态**：✅ 已完成
**依赖**：无
**可并行**：是

## 产出文件

- `src/rag/loader.ts`

## 实现要点

### 三个核心步骤

**Step 1 — Frontmatter 解析**

用正则 `/^---\n([\s\S]*?)\n---\n([\s\S]*)$/` 分离元数据和正文。元数据按 `key: value` 逐行解析为 `Record<string, string>`。解析失败时返回空 meta + 全文作为 body，不抛异常。

**Step 2 — 文档分块**

两级分块策略：

```
1. 按二级标题切分: content.split(/\n(?=## )/)
2. 大块(>1000字)按段落再切: chunk.split(/\n\n/)
3. 合并控制每块 200-800 字（大块继续切，小块合并相邻）
4. 过滤 <100 字符的无效块（纯标题行、分隔符等）
```

为什么不按固定 token 数切？
- Markdown 的 `##` 标题是天然的语义边界，按标题切能保持段落完整性
- 化工文档的标题层级很规整（概述→结构→操作→安全→故障），按标题切不会出现跨话题的碎片

**Step 3 — 目录遍历**

用 `readdirSync` + `extname` 过滤 `.md` 文件，逐文件执行 Step 1+2，返回 `Document[]`。

### 关键数据结构

```
Document { id, title, category, content, chunks: Chunk[] }
Chunk    { id, documentId, content, index, embedding?: number[] }
```

- `id` 从文件名推导（去 `.md` 后缀），保证可追溯
- `embedding` 字段预留，由 embedder 后续填充，加载阶段不涉及 API 调用

### 设计决策

- **为什么不是 LangChain 的 RecursiveCharacterTextSplitter？** MVP 阶段避免引入重依赖。自己实现的按标题+段落切分对于 5 篇结构化文档完全够用，后续数据量大了再切换
- **为什么 chunk.id 用 `${documentId}-chunk-${index}`？** 方便 debug 时从 chunk 反查文档，检索结果中的 source 信息即来源于此

## 验收标准

- [x] 正确加载 5 篇文档并解析 frontmatter
- [x] 分块大小在 200-800 字之间（少量边缘块可能略超出）
- [x] 每块保持语义完整（不在段落中间切断）
- [x] 无意义块被过滤
