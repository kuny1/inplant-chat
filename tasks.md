# InPlant Chat MVP — 任务拆解总览

> 每个任务详情见 `tasks/` 目录下的独立文件。

## 拆解思路

### 拆分原则

1. **原子化**：每个任务只做一件事，有单一明确的产出文件
2. **解耦**：尽量让任务不互相阻塞，通过接口约定解除依赖
3. **可并行**：同 Phase 内任务优先并行设计，减少串行等待
4. **可验证**：每个任务有独立的验收标准，完成了就能测

### 分层策略

```
Phase 1 ─ 项目骨架：零依赖，全部并行
Phase 2 ─ 基础设施：互相独立，全部并行
Phase 3 ─ 核心链路：内部有依赖链，但 3.3/3.5/3.6 可与 3.1→3.2→3.4 并行
Phase 4 ─ 核心组装：严格串行，累积前期所有成果
Phase 5 ─ 占位+文档：全部并行，不阻塞主链路
```

### 占位标准

所有 stub 文件遵循统一格式：

1. **完整类型接口** — 与真实实现同构
2. **最小可运行代码** — 返回模拟数据或 always-pass
3. **20-40 行设计注释** — 问题定义、核心算法、上下游关系、MVP→生产的变化、方案取舍
4. **`// EXTEND:` 标记** — 未来替换位置的显式锚点，可全局搜索

---

## 任务总览

### Phase 1：项目骨架（5 个任务，全部可并行）

| ID | 任务 | 产出 | 状态 |
|----|------|------|------|
| [T1.1](tasks/01-01-project-config.md) | 项目配置 | `package.json`, `tsconfig.json`, `.env.example` | ✅ |
| [T1.2](tasks/01-02-types.md) | 类型定义 | `src/types.ts` | ✅ |
| [T1.3](tasks/01-03-config-module.md) | 配置模块 | `src/config.ts` | ✅ |
| [T1.4](tasks/01-04-mock-data.md) | 模拟数据 | `data/documents/*.md` (5篇), `data/sensors.json` | ✅ |
| [T1.5](tasks/01-05-frontend-ui.md) | 前端 UI | `frontend/index.html` | ✅ |

### Phase 2：基础设施层（5 个任务，全部可并行）

| ID | 任务 | 产出 | 状态 |
|----|------|------|------|
| [T2.1](tasks/02-01-llm-client.md) | LLM 客户端 | `src/llm/client.ts` | ✅ |
| [T2.2](tasks/02-02-circuit-breaker-stub.md) | 熔断器 stub | `src/llm/circuit-breaker.ts` | 🔲 |
| [T2.3](tasks/02-03-rag-loader.md) | RAG 文档加载器 | `src/rag/loader.ts` | ✅ |
| [T2.4](tasks/02-04-memory-store.md) | 会话存储 | `src/memory/store.ts` | 🔲 |
| [T2.5](tasks/02-05-rate-limiter-stub.md) | 限流器 stub | `src/middleware/rate-limiter.ts` | 🔲 |

### Phase 3：核心链路（6 个任务，部分有依赖）

| ID | 任务 | 产出 | 依赖 | 状态 |
|----|------|------|------|------|
| [T3.1](tasks/03-01-embedder.md) | Embedding 服务 | `src/rag/embedder.ts` | T2.1, T2.3 | ✅ |
| [T3.2](tasks/03-02-retriever.md) | 检索器 | `src/rag/retriever.ts` | T3.1 | ✅ |
| [T3.3](tasks/03-03-tool-registry.md) | 工具注册表 | `src/tools/registry.ts` | T1.2 | ✅ |
| [T3.4](tasks/03-04-knowledge-tool.md) | 知识检索工具 | `src/tools/knowledge.ts` | T3.2, T3.3 | ✅ |
| [T3.5](tasks/03-05-sensor-tool.md) | 测点查询工具 | `src/tools/sensor.ts` | T1.4, T3.3 | ✅ |
| [T3.6](tasks/03-06-domain-guard.md) | 领域守卫 | `src/guard.ts` | — | ✅ |

### Phase 4：核心组装（3 个任务，串行依赖 Phase 3）

| ID | 任务 | 产出 | 依赖 | 状态 |
|----|------|------|------|------|
| [T4.1](tasks/04-01-agent-engine.md) | Agent 引擎 | `src/agent.ts` | T2.1, T3.3 | ✅ |
| [T4.2](tasks/04-02-validation-stub.md) | 校验 stub | `src/validation/checker.ts` | T1.2 | 🔲 |
| [T4.3](tasks/04-03-routes-app.md) | API 路由 + 应用组装 | `src/routes.ts`, `src/app.ts`, `src/main.ts` | T2.4, T2.5, T3.6, T4.1, T4.2 | ✅ |

### Phase 5：占位工具 + 文档（5 个任务，全部可并行）

| ID | 任务 | 产出 | 状态 |
|----|------|------|------|
| [T5.1](tasks/05-01-chatbi-stub.md) | ChatBI 占位 | `src/tools/chatbi.ts` | 🔲 |
| [T5.2](tasks/05-02-alarm-stub.md) | 报警助手占位 | `src/tools/alarm.ts` | 🔲 |
| [T5.3](tasks/05-03-task-stub.md) | 任务助手占位 | `src/tools/task.ts` | 🔲 |
| [T5.4](tasks/05-04-translate-stub.md) | 翻译助手占位 | `src/tools/translate.ts` | 🔲 |
| [T5.5](tasks/05-05-design-docs.md) | 设计文档 | `docs/*.md` (5篇) | ✅ |

---

## 执行策略

### 推荐执行顺序

```
第一轮（10 个并行）：
  T1.1  T1.2  T1.3  T1.4  T1.5
  T2.1  T2.2  T2.3  T2.4  T2.5

第二轮（混合）：
  T3.3  T3.5  T3.6         ← 与下组并行
  T3.1 → T3.2 → T3.4       ← 依赖链

第三轮（串行）：
  T4.1 → T4.2 → T4.3

第四轮（5 个并行）：
  T5.1  T5.2  T5.3  T5.4  T5.5
```

### 关键路径（最长不可压缩的串行链）

```
T1.2 → T3.3 → T3.4 → T4.1 → T4.3
                 或
T2.1 → T2.3 → T3.1 → T3.2 → T3.4 → T4.1 → T4.3
```

### 统计

| 维度 | 数值 |
|------|------|
| 总任务数 | 19 |
| ✅ 完整实现 | 10 |
| 🔲 占位实现 | 9 |
| 最大并行度 | 10 |
| 关键路径深度 | 7 |
| 验证场景 | 3 |
