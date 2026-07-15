# T4.3 API 路由 + 应用组装

**状态**：✅ 已完成
**依赖**：T2.4（会话存储）, T2.5（限流）, T3.6（守卫）, T4.1（Agent）, T4.2（校验）
**可并行**：否（需等待所有依赖完成）

## 产出文件

- `src/routes.ts`
- `src/app.ts`
- `src/main.ts`

## 实现要点

### app.ts — Fastify 应用实例

注册顺序（影响中间件执行顺序）：

```
1. @fastify/cors     → 允许前端跨域，开发阶段 origin: true
2. @fastify/static   → serve frontend/ 目录，使得 / 访问到 index.html
3. rate-limiter      → onRequest hook，先于路由处理执行
4. chatRoutes        → 挂载到 /api 前缀
```

为什么用 Fastify 而非 Express？
- 插件体系原生支持 async/await，无需额外包装
- `onRequest` hook 天然适合限流这类前置逻辑
- 性能在 Node.js 框架中属于第一梯队

### routes.ts — 核心路由

**POST /api/chat**（核心问答接口）：

```
handleChat(request, reply):
  { sessionId, message, stream } = request.body

  // 1. 领域守卫
  guardResult = guard(message)
  if !guardResult.passed:
    if stream → SSE 输出拒答文本
    else → JSON 返回拒答文本

  // 2. 会话管理
  session = sessionId ? store.getSession(sessionId) : store.createSession("demo-user")
  history = store.getMessages(session.id)

  // 3. Agent 执行
  if stream:
    → handleSSE(reply, agent, store, session.id, message, history)
  else:
    → handleJSON(reply, agent, store, session.id, message, history)
```

**SSE 流式模式**（handleSSE）：

```
1. 设置 headers: Content-Type: text/event-stream, Cache-Control: no-cache
2. for await (step of agent.run(...)):
     if step.type == "answer":
       → event: content  (发送完整回答文本)
     else:
       → event: step     (发送中间步骤，前端渲染进度条)
3. validateResponse(finalContent) → 填入 confidence
4. → event: done  (发送 ChatResponse，含 sessionId/confidence/steps)
5. 持久化: store.addMessage(user) + store.addMessage(assistant)
```

**JSON 模式**（handleJSON）：

```
1. for await (step of agent.run(...)): 收集 steps + finalContent
2. validateResponse(finalContent)
3. 持久化消息
4. return ChatResponse JSON
```

事件流设计：

| SSE event | 发送时机 | data 内容 | 前端渲染 |
|-----------|---------|-----------|---------|
| `step` | 每个非 answer 步骤 | `AgentStep`（type + name + status） | 更新步骤进度条 dot 颜色 |
| `content` | Agent 产出 answer | `{ delta: "回答全文" }` | 追加到回答气泡 textContent |
| `done` | 全部完成 | `ChatResponse`（含 sessionId, sources, confidence） | 渲染来源卡片 + 更新会话列表 |

**GET /api/sessions/:id**：按 ID 查会话 → 404 或返回 Session JSON

**DELETE /api/sessions/:id**：按 ID 删会话 → 返回 `{ success: true }`

### main.ts — 启动流程

```
main():
  1. createLLMClient()              → 检查 API Key，初始化客户端
  2. loadDocuments(data/documents)  → 5 篇 .md → Document[]
  3. embedDocuments(docs, llm)      → 调 embedding API → 写入 chunk.embedding
  4. new ToolRegistry()
     .register(KnowledgeTool)       → 注入 documents + llm
     .register(SensorTool)          → 注入 data 目录路径
  5. new MemoryStore()              → 内存会话存储
  6. new ReactAgent(llm, registry)  → 注入 LLM + 工具注册表
  7. createApp()                    → 创建 Fastify + 注册插件
     app.decorate("di", { store, agent })  → 依赖注入（简化版）
  8. app.listen(port)               → 启动 HTTP 服务
```

每步有 console 输出，启动失败时打印错误并 exit(1)。

### 依赖注入

当前用 `app.decorate("di", { store, agent })`——Fastify 的 decorate 机制，将依赖挂到实例上。路由中通过 `fastify.di` 访问。

这是 MVP 级别的简化注入，没有用 IoC 容器。当模块增多时（如 Phase 5 新增 4 个工具），可升级为 `awilix` 等轻量 DI 库，但 MVP 阶段够用。

## 验收标准

- [x] POST /api/chat 处理问答请求（stream + JSON 双模式）
- [x] 拒答场景返回预设话术（SSE 和 JSON 均支持）
- [x] SSE 三步事件（step → content → done）正常工作
- [x] GET /api/sessions/:id 返回会话历史
- [x] 前端页面通过 http://localhost:3000 访问
- [x] `main.ts` 启动流程每步有日志输出
