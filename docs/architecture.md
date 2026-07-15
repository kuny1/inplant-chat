# InPlant Chat MVP — 总体架构

> 最后更新：2026-07-15 | 版本：0.1.0

## 一、三层架构

```
用户请求
  │
  ▼
┌─────────────────────────────┐
│  Guard（守卫层）             │
│  guard.ts                   │
│  输入清洗 → 关键词匹配 → 放行/拒答
│  未来扩展：歧义检测、LLM灰度确认
├─────────────────────────────┤
│  Agent（编排层）             │
│  agent.ts + agent/          │
│  ReAct循环：Think→Act→Observe
│  工具并发 + 重试 + 降级      │
│  中断支持 (AbortSignal)      │
│  未来扩展：Plan-Execute、Saga
├─────────────────────────────┤
│  Output（输出层）             │
│  routes.ts                  │
│  SSE流式 / JSON 双模式       │
│  过程透出：step→content→done │
└─────────────────────────────┘
  │
  ▼
用户响应
```

## 二、模块依赖图

```
main.ts
  ├─ config.ts
  ├─ llm/client.ts
  ├─ rag/
  │   ├─ loader.ts
  │   ├─ embedder.ts
  │   └─ retriever.ts
  ├─ tools/
  │   ├─ registry.ts
  │   ├─ knowledge.ts  ← rag/retriever
  │   ├─ sensor.ts
  │   ├─ chatbi.ts     (占位)
  │   ├─ alarm.ts      (占位)
  │   ├─ task.ts       (占位)
  │   └─ translate.ts  (占位)
  ├─ memory/store.ts
  ├─ guard.ts
  ├─ agent/
  │   ├─ prompt.ts
  │   └─ tool-executor.ts
  ├─ agent.ts
  ├─ validation/checker.ts (占位)
  ├─ middleware/rate-limiter.ts (占位)
  ├─ app.ts
  └─ routes.ts
```

## 三、数据流（完整请求链路）

```
POST /api/chat { message: "R-101温度正常吗？" }

1. rate-limiter (onRequest hook) → 计数检查
2. routes.ts: guard(message) → 关键词得分>=3 → 放行
3. routes.ts: store.createSession / getSession
4. routes.ts: agent.run(sessionId, message, history, { signal })
   ├─ Loop 1:
   │   ├─ yield thinking(running)
   │   ├─ llm.chat(messages, tools)
   │   ├─ yield thinking(completed)
   │   ├─ LLM 返回 tool_calls: [sensor_query({pointId:"T-101"})]
   │   ├─ ToolExecutor.execute():
   │   │   ├─ yield tool_call(running) for each
   │   │   ├─ signal check
   │   │   ├─ Promise.allSettled([executeOne(T-101)])
   │   │   │   └─ 成功 → yield tool_result(completed)
   │   │   └─ 结果注入 messages
   │   └─ continue loop
   └─ Loop 2:
       ├─ llm.chat(messages + tool_result, tools)
       └─ 无 tool_calls → yield answer(completed)
5. routes.ts: validateResponse(content, sources) → always-pass
6. SSE: event:done → ChatResponse JSON (sessionId, content, sources, confidence, steps)
7. store.addMessage (user + assistant)
```

## 四、扩展点索引

| 模块 | 文件 | 标记 | 扩展方向 |
|------|------|------|---------|
| Guard | guard.ts | 注释 | 灰度区 LLM 二次确认 |
| Guard | guard.ts | 注释 | 歧义检测 + 澄清反问 |
| Agent | agent.ts | 注释 | Plan-and-Execute 编排器 |
| Agent | agent.ts | 注释 | Saga 补偿事务 |
| Agent | agent.ts | 注释 | Orchestrator 接口抽象 |
| Tools | registry.ts | 注释 | 工具权限控制 |
| Tools | registry.ts | 注释 | 副作用声明 + compensatingAction |
| Tools | registry.ts | 注释 | 热加载 |
| RAG | retriever.ts | 注释 | pgvector ivfflat 索引 |
| RAG | retriever.ts | 注释 | HNSW 索引 |
| RAG | retriever.ts | 注释 | BM25 混合检索 |
| Memory | store.ts | 接口预留 | PgVectorStore 实现 |
| Memory | store.ts | 接口预留 | 上下文压缩 summarizeAndCompress |
| LLM | client.ts | 注释 | QwenClient 多模型切换 |
| LLM | circuit-breaker.ts | 注释 | 完整三态熔断 |
| Validation | checker.ts | 注释 | SafetyChecker + FactualityChecker 管线 |
| RateLimiter | rate-limiter.ts | 注释 | Token Bucket + Redis |
| Config | config.ts | 注释 | QWEN_API_KEY / MODEL_PROVIDER |
| Types | types.ts | 接口 | SagaLogEntry / AsyncTask / VectorStore / ModelStrategy |
