# InPlant Chat MVP — 架构设计思路

## 一、产品定位

开发一个类似"中控智问 InPlant ChatBA"的 Agent 产品 MVP，聚焦「聚合反应釜」这一具体设备的智能问答。非领域问题直接拒答并给出未来支持提示。核心目标是验证架构设计的合理性和可迭代性，为后续深度定制和长期迭代奠定基础。

**技术栈**：Node.js/TypeScript + DeepSeek API（主）+ 内存存储（接口预留 pgvector）+ 纯 HTML/JS 前端

---

## 二、第一性原理分析

**这个 MVP 的本质是什么？**

> 一个能判断用户问题是否关于「聚合反应釜」，如果是就用知识库 + 工具回答，过程可见；如果不是就拒答的对话 Agent。

从本质出发，最小必要组件：

| 必要 | 组件 | 理由 |
|------|------|------|
| ✅ | 领域守卫 | 产品的核心差异点——没有它就不是「聚焦设备」的 Agent |
| ✅ | RAG 知识检索 | 回答设备问题的唯一知识来源 |
| ✅ | LLM + 工具调用 | Agent 之所以是 Agent 的原因 |
| ✅ | 过程透出(SSE) | 「过程可预期」是产品五大原则之一 |

被奥卡姆剃刀 Cut 掉的（MVP 不需要）：

| Cut 掉 | 理由 | 占位方式 |
|--------|------|---------|
| 智能路由 | MVP 只有一种问题类型，不需要复杂度评分和多模型策略 | `guard.ts` 内 if-else + 注释说明未来扩展方向 |
| Saga 回滚 | 没有长程多步事务场景 | `agent.ts` 内注释说明编排层扩展点 |
| PostgreSQL/pgvector | 8 篇文档不需要数据库 | `memory/store.ts` 用 Map 实现，接口预留 vectorSearch() |
| 6 个全部工具 | 用 2 个验证工具调用模式即可 | 其余 4 个各一个 stub 文件，含完整接口定义 + 设计注释 |
| 歧义检测/事实校验/熔断/限流 | MVP 单人 demo 场景不需要 | 各自 stub：always-pass + 设计注释说明算法和管线 |

---

## 三、极简架构（三层 + 横切）

```
用户请求
  │
  ▼
┌──────────────────────────────────────────────┐
│  Guard（输入层）                               │
│  ├─ 输入清洗：trim + 长度限制 + XSS 过滤       │
│  ├─ 关键词匹配：~100 词/三级权重               │
│  └─ 拒答：领域提示模板                          │
│  未来扩展：歧义检测 → LLM 二次确认             │
├──────────────────────────────────────────────┤
│  Agent（编排层）                                │
│  ├─ ReAct 循环（最多 5 轮）                    │
│  │   Think → Act → Observe → Loop              │
│  ├─ System Prompt：角色 + 领域约束 + 工具指南   │
│  └─ 工具调用：ToolRegistry.execute()            │
│  未来扩展：Plan-and-Execute / Saga / Retry     │
├──────────────────────────────────────────────┤
│  Tools（能力层）                                │
│  ├─ ✅ knowledge_query：RAG 检索 5 篇文档      │
│  ├─ ✅ sensor_query：模拟测点数据查询           │
│  ├─ 🔲 chatbi_query / alarm / task / translate │
│  扩展：工具权限 / 热加载 / 副作用声明           │
├──────────────────────────────────────────────┤
│  RAG（知识层）                                  │
│  ├─ DocumentLoader：加载 Markdown               │
│  ├─ Embedder：DeepSeek Embedding API            │
│  └─ Retriever：余弦相似度（内存暴力搜索）       │
│  未来扩展：pgvector ivfflat / HNSW             │
├──────────────────────────────────────────────┤
│  Memory（记忆层）                               │
│  └─ MemoryStore：Map 实现 CRUD                 │
│  接口预留：vectorSearch / contextSummary       │
│  未来扩展：PostgreSQL + pgvector               │
├──────────────────────────────────────────────┤
│  Validation（校验层）                           │
│  └─ always-pass stub                           │
│  设计注释：SafetyChecker / FactualityChecker   │
│  管线 + 小模型校验方案                          │
├──────────────────────────────────────────────┤
│  Output（输出层）                               │
│  └─ SSE 流式输出：step / content / done 事件    │
│  前端渲染：步骤状态 → 思考过程 → 回答 + 来源    │
└──────────────────────────────────────────────┘
  │
  ▼
用户响应
```

**横切关注点（stub 占位）**：

| 模块 | 当前实现 | 设计注释说明 |
|------|---------|-------------|
| Circuit Breaker | CLOSED 永远放行 | 三态转换、阈值配置、装饰器集成、`opossum` 建议 |
| Rate Limiter | Map 简单计数 | Token Bucket 算法、三级限流、Redis+Lua 方案 |
| LLM 多模型 | 仅 DeepSeek | LLMClient 接口抽象、QwenClient 实现方式、config 切换 |

---

## 四、核心设计决策

### 4.1 为什么是 ReAct 而不是 Plan-and-Execute？

MVP 场景的查询最多需要 2-3 步（检索知识 + 查测点 + 综合分析），不需要显式规划。ReAct 循环天然支持这种"边想边做"的模式。Plan-and-Execute 的扩展点在 `agent.ts` 中以注释方式预留，当任务复杂度超过阈值（步骤数 > 5）时切换到规划模式。

### 4.2 为什么工具是 Class 继承而不是纯函数？

`BaseTool` 抽象类强制每个工具声明 name / description / parameters（JSON Schema）三个元数据，ToolRegistry 可以直接将其转换为 LLM function calling 格式。这比纯函数 + 手动注册更不易出错。新增工具只需 `class XxxTool extends BaseTool` + `registry.register(new XxxTool())`。

### 4.3 为什么内存存储而不是直接上 PostgreSQL？

5 篇文档、10 个测点的数据量用内存完全够，且省去了 Docker 环境配置的复杂度。关键是把接口设计好——`SessionStore` 接口的方法签名与 PostgreSQL schema 对齐，未来切换只需 `new PgVectorStore()` 替换 `new MemoryStore()`，调用方零改动。

### 4.4 Stub 的哲学

每一个 stub 不是"空壳"，而是"设计文档的可执行版本"：

- **类型接口**：与真实实现同构，后续开发只需填 `execute()` 方法体
- **模拟返回**：返回符合真实数据结构的数据，让调用方能正常走通全链路
- **设计注释**：回答三个问题——为什么需要这个模块？核心算法是什么？MVP 到生产的关键变化？
- **EXTEND 标记**：显式锚点，方便全局搜索定位所有待扩展点

---

## 五、数据流示例

用户：「R-101 的温度是多少？正常吗？」

```
1. Guard: 关键词命中"温度""R-101"，反应釜领域得分 8 → 放行
2. Agent 第1轮: LLM 推理 → 需要同时查传感器和知识库
   → tool_call: sensor_query({pointId: "T-101"})
   → tool_call: knowledge_query({question: "反应釜正常温度范围"})
3. Agent 第2轮: 收到 T-101=185°C + 知识库"正常范围120-160°C"
   → LLM 推理 → 185°C 超出正常范围 → 结合故障文档 → 生成综合回答
4. SSE 输出:
   event: step → {type:"tool_call", name:"sensor_query", status:"running"}
   event: step → {type:"tool_call", name:"knowledge_query", status:"running"}
   event: step → {type:"tool_call", name:"sensor_query", status:"completed"}
   event: step → {type:"tool_call", name:"knowledge_query", status:"completed"}
   event: content → {delta:"R-101当前温度185°C..."}
   event: done → {sources:[...], confidence:0.88}
```

---

## 六、迭代路线图（各 Stub 的演进优先级）

| 优先级 | 模块 | 当前状态 | 目标状态 | 触发条件 |
|--------|------|---------|---------|---------|
| P0 | Memory Store | Map 内存 | pgvector + PostgreSQL | 文档量 > 100 或需要跨会话检索 |
| P1 | Guard | 关键词匹配 | + LLM 灰度区确认 | 关键词误判率 > 10% |
| P2 | Agent | ReAct | + Plan-and-Execute | 出现步骤数 > 5 的复杂查询 |
| P3 | Saga | 注释预留 | 完整补偿事务 | 引入有副作用的工具（工单创建/报警确认） |
| P4 | Router | if-else | ComplexityScorer + 多策略 | 日请求量 > 1000，需要成本优化 |
| P5 | Validation | always-pass | Safety + Factuality 管线 | 对外发布或接入真实数据 |
| P6 | Rate Limiter | 简单计数 | Token Bucket + Redis | 多用户并发场景 |
| P7 | Circuit Breaker | 永远 CLOSED | 完整熔断逻辑 | 外部 API 出现过不稳定 |
| P8 | Qwen 备用 | 注释 | QwenClient 实现 | DeepSeek 服务出现过长时间不可用 |

---

## 七、不做的（MVP 范围外）

- 真实工业数据库对接（保留接口，模拟数据替代）
- 用户认证系统（MVP 使用简单的 userId header）
- 管理后台 / 发布系统
- 面试官 / PPT / 企业洞察 / 代码生成等其他办公助手
- 工作流可视化编辑器
- 多租户 / 企业级权限
- 移动端适配
- Docker 部署（本地 `pnpm dev` 即可）
- 单元测试（MVP 手动验证 3 个场景）
