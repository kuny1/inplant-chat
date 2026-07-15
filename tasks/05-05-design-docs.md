# T5.5 设计文档

**状态**：✅ 完整实现
**依赖**：无（但建议在所有代码完成后撰写，内容更准确）
**可并行**：是

## 产出文件

- `docs/architecture.md`
- `docs/agent-design.md`
- `docs/tools-design.md`
- `docs/data-design.md`
- `docs/iteration-roadmap.md`

## 各文档要点

### architecture.md — 总体架构

- 三层架构图（ASCII art）
- 各层职责简述
- 完整文件结构导航
- 扩展点索引表（列出所有 `// EXTEND:` 标记所在文件和行数）
- 数据流示例（用户问题 → Guard → Agent → Output 的完整链路）

### agent-design.md — Agent 编排设计

- System Prompt 完整文本 + 每段的设计理由
- ReAct 循环伪代码
- 过程透出策略（三种 SSE 事件的设计意图）
- 扩展方案（代码级示例）：
  - Plan-and-Execute 模式如何切入
  - Saga 补偿事务如何登记和回滚
  - Orchestrator 接口抽象方案

### tools-design.md — 工具系统设计

- 工具注册机制的原理图
- 6 个工具的 JSON Schema 完整定义
- 有副作用工具的 Saga 补偿对照表
- 新增工具开发指南（step by step）

### data-design.md — 数据层设计

- 模拟数据结构说明（sensors.json 字段含义）
- 文档分块策略（为什么按 ## 切分、为什么要 200-800 字）
- Embedding 模型选型理由（text-embedding-3-small vs large vs 本地模型）
- pgvector 迁移路径：
  - 当前：内存暴力搜索 O(n)
  - 中期：pgvector ivfflat 索引
  - 远期：HNSW 索引
  - 每阶段触发条件和实施步骤

### iteration-roadmap.md — 迭代路线图

按优先级排列的待实现功能：

| 优先级 | 模块                      | 触发条件                    | 预计工时 |
| ------ | ------------------------- | --------------------------- | -------- |
| P0     | Memory → pgvector         | 文档量 > 100 或需跨会话检索 | 8h       |
| P1     | Guard 灰度区 LLM 确认     | 关键词误判率 > 10%          | 3h       |
| P2     | Agent Plan-and-Execute    | 出现步骤 > 5 的复杂查询     | 12h      |
| P3     | Saga 完整实现             | 引入有副作用工具            | 16h      |
| P4     | Router 智能评分           | 日请求量 > 1000             | 8h       |
| P5     | Validation 启用           | 对外发布或接入真实数据      | 6h       |
| P6     | Rate Limiter Token Bucket | 多用户并发                  | 4h       |
| P7     | Circuit Breaker           | 外部 API 不稳定             | 3h       |
| P8     | Qwen 备用模型             | DeepSeek 长时间不可用       | 4h     |

每项包含：
- 前置依赖
- 核心文件（新建 / 修改）
- 风险和注意事项

## 验收标准

- [ ] 5 篇文档均用中文撰写，结构清晰
- [ ] 架构文档包含完整的 ASCII art 架构图
- [ ] 迭代路线图有明确的优先级和触发条件
- [ ] 每篇文档有"最后更新日期"和版本号
