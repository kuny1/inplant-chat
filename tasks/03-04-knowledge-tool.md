# T3.4 知识检索工具

**状态**：✅ 已完成
**依赖**：T3.2（检索器）, T3.3（工具注册表）
**可并行**：否

## 产出文件

- `src/tools/knowledge.ts`

## 实现要点

### 工具元数据

```
name: "knowledge_query"
description: 告知 LLM 在用户询问设备结构、操作规范、故障处理等场景时调用
parameters:
  question: string (必填) — 检索关键词
  topK: number (可选，默认3，最大5) — 返回结果数
```

description 是 LLM 判断何时调用的唯一依据，所以写明了具体场景（"设备结构、工作原理、操作规范、工艺参数、安全事项、故障诊断、维护保养"），帮助 LLM 做准确的工具选择。

### execute 流程

```
KnowledgeTool.execute({ question, topK }):
  1. topK = min(topK || 3, 5)      // 限制上限，防止一次检索过多
  2. results = retrieve(question, documents, llm, { topK })
  3. 格式化:
     chunks: [{ content, source: document.title, relevance: round(score, 2) }]
  4. 返回 ToolResult { content: JSON.stringify({ chunks, totalFound }) }
```

### 与 LLM 的交互模式

```
用户: "反应釜温度过高怎么办？"
  → LLM 决策: 需要查知识库
  → tool_call: knowledge_query({ question: "反应釜温度过高 处理" })
  → 工具返回: [{ content: "...排查步骤...", source: "常见故障诊断与处理", relevance: 0.92 }]
  → LLM: 基于返回的文档块生成回答，引用来源
```

工具不生成最终回答，只提供原始材料。LLM 负责理解材料、整合信息、生成用户可读的回答。

### 设计决策

- **为什么 topK 上限为 5？** 上下文窗口有限，太多文档块会挤占 LLM 推理空间。3-5条是 RAG 场景的常见最佳实践
- **为什么 relevance 要 round 到两位小数？** 减少 token 消耗（"0.923456789" vs "0.92"），且两位小数对 LLM 判断相关性已经足够

### 扩展方向

注释预留混合检索方案：语义相似度 0.7 + BM25 关键词 0.3，当文档量增大时补充关键词召回能力。

## 验收标准

- [x] 能根据查询返回 topK 相关文档块
- [x] 返回结果包含 content、source、relevance
- [x] topK 上限为 5
- [x] 无结果时返回空列表不报错
