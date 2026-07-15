# 迭代路线图

> 最后更新：2026-07-15 | 版本：0.1.0

## 优先级排序

各模块按 P0-P8 排列，标明了触发条件、预计工时和前置依赖。

| 优先级 | 模块 | 当前 | 目标 | 触发条件 | 工时 | 前置依赖 |
|--------|------|------|------|---------|------|---------|
| **P0** | Memory → pgvector | Map 内存 | PostgreSQL + pgvector | 文档量 > 100 或需跨会话检索 | 8h | Docker 环境 |
| **P1** | Guard 灰度区 LLM 确认 | 关键词匹配 | + LLM 单次分类 | 关键词误判率 > 10% | 3h | — |
| **P2** | Agent Plan-and-Execute | ReAct | + 规划-执行模式 | 出现步骤 >5 的复杂查询 | 12h | P0（需理解编排器接口） |
| **P3** | Saga 完整实现 | 注释预留 | 补偿事务 + 回滚 | 启用有副作用工具 | 16h | P2（编排器需支持多步） |
| **P4** | Router 智能评分 | if-else | ComplexityScorer + 多策略 | 日请求量 >1000，需成本优化 | 8h | — |
| **P5** | Validation 启用 | always-pass | SafetyChecker + FactualityChecker | 对外发布或接入真实数据 | 6h | — |
| **P6** | Rate Limiter Token Bucket | 简单计数 | Token Bucket + Redis | 多用户并发 | 4h | Redis 环境 |
| **P7** | Circuit Breaker 完整实现 | always CLOSED | 三态状态机 | 外部 API 出现过不稳定 | 3h | — |
| **P8** | Qwen 备用模型 | 注释预留 | QwenClient 实现 + 自动切换 | DeepSeek 长时间不可用 | 4h | P7（熔断触发自动切换） |

## 各模块扩展详情

### P0: Memory → pgvector

**文件**：`src/memory/store.ts`（重写） + `db/init.sql`（新增）

**接口已预留**：
- `SessionStore` 接口方法签名与 PostgreSQL schema 对齐
- `vectorSearch()` 和 `summarizeAndCompress()` 方法签名已定义
- PgVectorStore SQL 预览已在注释中

**实施**：
1. 用 `pg` 或 `drizzle-orm` 连接 PostgreSQL
2. 实现 `PgVectorStore implements SessionStore`
3. 替换 `main.ts` 中的 `new MemoryStore()` → `new PgVectorStore(pool)`
4. 创建 `message_embeddings` 表 + ivfflat 索引

### P1: Guard 灰度区 LLM 确认

**文件**：`src/guard.ts`（修改）

**实施**：
- 当得分在 2-4（灰度区），调 LLM 单次分类
- prompt: "判断以下问题是否与聚合反应釜设备的操作、维护、监控或故障处理相关。仅回答 YES 或 NO。"
- 单次分类耗时 < 1s，成本可控

### P2: Agent Plan-and-Execute

**文件**：`src/agent/plan-execute-orchestrator.ts`（新增）

**实施**：
1. 实现 `PlanExecuteOrchestrator implements Orchestrator`
2. PlanGenerator: LLM 输出 `Plan{ steps[{type, tool, args}] }`
3. StepExecutor: 顺序执行，每 step 之间 signal 检查
4. RetryHandler: 指数退避 1s→2s→4s→8s，最多3次
5. 通过复杂度评分自动选择编排器

### P3: Saga 完整实现

**文件**：`src/agent/saga-manager.ts`（新增）

**实施**：
1. 有副作用工具的 BaseTool 增加 `compensatingAction` 字段
2. SagaManager 记录每步执行状态到 saga_log
3. 失败时逆序遍历，执行补偿操作
4. 补偿失败记录日志，人工介入

### P4-P8

| 模块 | 核心变化 | 风险 |
|------|---------|------|
| Router | 5维复杂度评分 + 策略模式选择模型/温度/tools | 评分权重需根据实际数据调优 |
| Validation | 两阶段管线（Safety + Factuality） | LLM 校验的成本和延迟 |
| Rate Limiter | Redis Token Bucket 替代 Map 计数器 | Redis 运维成本 |
| Circuit Breaker | 完整三态状态机 | 阈值调优需要历史故障数据 |
| Qwen | QwenClient 实现 + 熔断自动切换 | API 兼容性验证 |
