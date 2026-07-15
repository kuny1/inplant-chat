import { randomUUID } from "crypto";
import type { Message, Session } from "../types.js";

/**
 * 会话存储接口
 *
 * ## 设计意图
 * SessionStore 接口定义了会话和消息的完整 CRUD 操作契约。
 * 方法签名与 PostgreSQL schema 对齐，未来切换数据库时调用方零改动。
 *
 * 对应关系:
 *   sessions 表           → createSession / getSession / deleteSession
 *   messages 表           → addMessage / getMessages
 *   message_embeddings 表 → vectorSearch (预留)
 *
 * ## MVP → 生产: 从 MemoryStore 到 PgVectorStore
 * ```typescript
 * // MVP
 * const store = new MemoryStore();
 *
 * // 生产: 只需替换实现
 * const pool = new Pool({ connectionString: process.env.DATABASE_URL });
 * const store = new PgVectorStore(pool);
 * ```
 * 调用方代码无需任何改动。
 *
 * ## pgvector 向量检索 SQL（生产设计预览）
 * ```sql
 * SELECT m.content, m.metadata,
 *        1 - (me.embedding <=> $1) AS similarity
 * FROM message_embeddings me
 * JOIN messages m ON m.id = me.message_id
 * WHERE m.session_id = $2
 *   AND 1 - (me.embedding <=> $1) > 0.7
 * ORDER BY similarity DESC
 * LIMIT $3;
 * ```
 * `<=>` 是 pgvector 的余弦距离运算符。
 */
export interface SessionStore {
  createSession(userId?: string): Session;
  getSession(id: string): Session | undefined;
  addMessage(sessionId: string, message: Message): void;
  getMessages(sessionId: string): Message[];
  deleteSession(id: string): void;

  /** EXTEND: 语义检索历史消息 */
  // vectorSearch(sessionId: string, embedding: number[], topK: number):
  //   Promise<Array<{ message: Message; score: number }>>;

  /** EXTEND: 上下文压缩，将早期消息摘要化 */
  // summarizeAndCompress(sessionId: string): Promise<string>;
}

/**
 * 内存实现
 * 使用 Map 存储会话，适合 MVP 单进程场景。
 * 进程重启后数据丢失，但 MVP 演示场景可接受。
 */
export class MemoryStore implements SessionStore {
  private sessions = new Map<string, Session>();

  createSession(userId?: string): Session {
    const session: Session = {
      id: randomUUID(),
      userId,
      title: "新会话",
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.sessions.set(session.id, session);
    return session;
  }

  getSession(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  addMessage(sessionId: string, message: Message): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`会话 ${sessionId} 不存在`);
    }
    session.messages.push(message);
    session.updatedAt = new Date();

    // 自动标题: 取第一条用户消息的前 30 字
    if (session.title === "新会话" && message.role === "user") {
      const title = message.content.slice(0, 30);
      session.title = title + (message.content.length > 30 ? "..." : "");
    }
  }

  getMessages(sessionId: string): Message[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    // 只返回最近 maxContextMessages 条，模拟上下文压缩
    // EXTEND: 完整实现应返回摘要 + 最近消息的组合
    const maxMsgs = 10;
    const msgs = session.messages;
    if (msgs.length <= maxMsgs) return msgs;

    return msgs.slice(-maxMsgs);
  }

  deleteSession(id: string): void {
    this.sessions.delete(id);
  }
}
