# 数据层设计

> 最后更新：2026-07-15 | 版本：0.1.0

## 一、知识文档

### 文档清单

| 文件 | 标题 | 字数 | 支撑场景 |
|------|------|------|---------|
| overview.md | 聚合反应釜概述 | ~600 | 设备定义、应用、分类、R-101 参数 |
| structure.md | 结构组成与工作原理 | ~700 | 五大组件 + 聚合四阶段原理 |
| operation.md | 操作规范与工艺参数 | ~650 | 开车检查、操作流程、配方示例 |
| safety.md | 安全规范与应急处置 | ~700 | 四类风险、三级报警、联锁表、应急四场景 |
| troubleshooting.md | 常见故障诊断与处理 | ~800 | 温度/压力/搅拌/密封/出料五大故障 |

### 文档格式

`---frontmatter---` 声明 title 和 category，正文使用 Markdown 标准格式（`#`/`##` 标题、表格、列表）。

### 分块策略

| 步骤 | 方法 | 参数 |
|------|------|------|
| 第一层 | 按 `##` 二级标题切分 | — |
| 第二层 | 大块(>1000字)按 `\n\n` 段落再切 | — |
| 合并控制 | 每块 200-800 字 | — |
| 过滤 | 去除 <100 字符的无效块 | — |

选择按标题切分而非固定 token 数的原因：Markdown 的 `##` 是天然的语义边界，化工文档的标题层级规整，按标题切能保持每块的话题完整性。

## 二、传感器数据

### 数据结构

```json
{
  "id": "T-101",
  "name": "釜内温度A",
  "location": "R-101釜体上部",
  "unit": "°C",
  "normalRange": [120, 160],
  "currentValue": 155.2,
  "updatedAt": "2026-07-15T08:00:00Z"
}
```

### 测点布局（模拟 DCS 系统）

| 类型 | 测点 | 位置 |
|------|------|------|
| 温度 ×4 | T-101~T-104 | 釜体上部/中部、夹套进/出口 |
| 压力 ×2 | P-101~P-102 | 釜顶、夹套 |
| 液位 ×2 | L-101~L-102 | 釜体、缓冲罐 |
| 流量 ×1 | F-101 | 夹套进口管 |
| 转速 ×1 | V-101 | 搅拌电机 |

数据存放在 `data/sensors.json`，启动时由 SensorTool 构造器加载到内存。与代码分离，方便替换为真实数据源（外部脚本更新 JSON → 重启服务或热加载）。

## 三、向量存储

### 当前方案（MVP）

```
内存暴力搜索 O(n)
  Chunk.embedding: number[1536]   // 挂在 chunk 对象上
  检索: 遍历所有 chunk，计算余弦相似度，排序取 topK
```

### 扩展路径

| 阶段 | 数据量 | 方案 | 延迟 |
|------|--------|------|------|
| MVP | ~50 chunks | 内存暴力搜索 | <1ms |
| 中期 | 100~10000 chunks | pgvector ivfflat 索引 | <10ms |
| 远期 | >10万 chunks | pgvector HNSW 或 Milvus/Qdrant | <5ms |

### Embedding 模型

当前使用 DeepSeek `text-embedding-3-small`（兼容 OpenAI 接口），1536 维。50 个 chunk 的精度完全够用。

后续如需更高精度可切换 `text-embedding-3-large`（3072 维），或在数据量增大后使用本地部署的 embedding 模型降低 API 成本和延迟。

## 四、会话存储

### 当前方案

`MemoryStore` — Map 实现，进程重启后数据丢失（MVP 可接受）。

### 接口设计

`SessionStore` 接口的方法签名与 PostgreSQL schema 对齐。未来切换 `PgVectorStore` 时，只需 `new PgVectorStore(pool)` 替换 `new MemoryStore()`，调用方零改动。

### 预留字段

- `vectorSearch(sessionId, embedding, topK)` — 语义检索历史消息
- `summarizeAndCompress(sessionId)` — 上下文压缩，早期消息 → 结构化摘要

## 五、数据量控制

MVP 数据量严格控制在 10 条以内：

| 数据类型 | 数量 | 存储 |
|---------|------|------|
| 知识文档 | 5 篇 | Markdown 文件 |
| 传感器测点 | 10 个 | JSON 文件 |
| 报警记录 | 3 条（硬编码在 AlarmTool） | — |
| 工单记录 | 2 条（硬编码在 TaskTool） | — |
