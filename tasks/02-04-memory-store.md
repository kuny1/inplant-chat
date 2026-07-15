# T2.4 会话存储

**状态**：🔲 占位实现（接口完整 + 内存实现）
**依赖**：T1.2（类型定义）
**可并行**：是

## 产出文件

- `src/memory/store.ts`

## 实现要点

### 接口设计

`SessionStore` 接口定义 5 个核心方法 + 2 个预留扩展：

```
interface SessionStore {
  createSession(userId?) → Session        // 创建新会话，自动生成 UUID
  getSession(id) → Session | undefined    // 按 ID 获取
  addMessage(sessionId, message) → void   // 追加消息
  getMessages(sessionId) → Message[]      // 获取消息列表
  deleteSession(id) → void               // 删除会话

  // EXTEND: 语义检索历史（对应 pgvector message_embeddings 表）
  // vectorSearch(sessionId, embedding, topK) → Array<{message, score}>

  // EXTEND: 上下文压缩（早期消息→结构化摘要）
  // summarizeAndCompress(sessionId) → string
}
```

### 方法签名与 PostgreSQL schema 的对应

| 接口方法 | SQL 操作 | 对应表 |
|---------|---------|--------|
| `createSession` | `INSERT INTO sessions` | sessions |
| `getSession` | `SELECT * FROM sessions WHERE id = $1` | sessions |
| `addMessage` | `INSERT INTO messages` | messages |
| `getMessages` | `SELECT * FROM messages WHERE session_id = $1 ORDER BY created_at` | messages |
| `deleteSession` | `DELETE FROM sessions WHERE id = $1` (CASCADE) | sessions + messages |

这种对齐意味着未来从 `MemoryStore` 切换到 `PgVectorStore` 时，调用方代码零改动。

### MemoryStore 实现细节

- 用 `Map<string, Session>` 存储，O(1) 查找
- `createSession`：`randomUUID()` 生成 ID，初始标题为"新会话"
- `addMessage`：追加到 `session.messages[]` + 自动标题（取首条用户消息前 30 字）
- `getMessages`：限制返回最近 10 条（`maxContextMessages`），超出部分截断——这是简化版的上下文管理，注释标明完整方案应返回摘要+最近消息
- `deleteSession`：Map.delete，进程重启后数据丢失（MVP 可接受）

### pgvector 迁移预览

注释中包含完整的生产 SQL 示例：

```sql
SELECT m.content, 1 - (me.embedding <=> $1) AS similarity
FROM message_embeddings me
JOIN messages m ON m.id = me.message_id
WHERE m.session_id = $2
  AND 1 - (me.embedding <=> $1) > 0.7
ORDER BY similarity DESC LIMIT $3;
```

其中 `<=>` 是 pgvector 的余弦距离运算符，`1 - distance = similarity`。

### 设计决策

- **为什么没有 `listSessions` 方法？** MVP 只有 demo 场景，不需要会话列表管理；接口先精简，需要时再加
- **为什么 `getMessages` 要截断而不是全部返回？** 模拟上下文窗口管理，防止单次请求塞入过长历史导致 LLM 输入超限

## 验收标准

- [x] 支持会话和消息 CRUD
- [x] 自动取首条用户消息前 30 字作为会话标题
- [x] 接口预留 vectorSearch 和 summarizeAndCompress 方法签名
- [x] 注释包含 pgvector SQL 设计预览
