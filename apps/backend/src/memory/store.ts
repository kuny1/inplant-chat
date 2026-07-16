import { randomUUID } from "crypto";
import type { Message, Session } from "../types";

/** 演示用 userId，符合 UUID 格式，兼容 PostgreSQL uuid 列 */
export const DEMO_USER_ID = "00000000-0000-0000-0000-000000000001";

export interface SessionStore {
  createSession(userId?: string): Promise<Session>;
  getSession(id: string): Promise<Session | undefined>;
  updateSession(id: string, fields: { title?: string; contextSummary?: string }): Promise<void>;
  addMessage(sessionId: string, message: Message): Promise<void>;
  getMessages(sessionId: string, limit?: number): Promise<Message[]>;
  deleteSession(id: string): Promise<void>;
  listSessions(userId?: string): Promise<Session[]>;

  /** EXTEND: 语义检索历史消息 */
  // vectorSearch(embedding: number[], topK: number, excludeSessionId?: string):
  //   Promise<Array<{ message: Message; score: number }>>;

  /** EXTEND: 上下文压缩，将早期消息摘要化。返回压缩后的摘要文本 */
  // summarizeAndCompress(sessionId: string, llm: LLMClient): Promise<string>;
}

/**
 * 内存实现。进程重启后数据丢失，仅用于开发/演示。
 */
export class MemoryStore implements SessionStore {
  private sessions = new Map<string, Session>();

  async createSession(userId?: string): Promise<Session> {
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

  async getSession(id: string): Promise<Session | undefined> {
    return this.sessions.get(id);
  }

  async updateSession(
    id: string,
    fields: { title?: string; contextSummary?: string }
  ): Promise<void> {
    const s = this.sessions.get(id);
    if (!s) return;
    if (fields.title) s.title = fields.title;
    if (fields.contextSummary !== undefined) s.contextSummary = fields.contextSummary;
    s.updatedAt = new Date();
  }

  async addMessage(sessionId: string, message: Message): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`会话 ${sessionId} 不存在`);
    session.messages.push(message);
    session.updatedAt = new Date();
    if (session.title === "新会话" && message.role === "user") {
      const t = message.content.slice(0, 30);
      session.title = t + (message.content.length > 30 ? "..." : "");
    }
  }

  async getMessages(sessionId: string, limit = 10): Promise<Message[]> {
    const msgs = this.sessions.get(sessionId)?.messages ?? [];
    if (msgs.length <= limit) return msgs;
    return msgs.slice(-limit);
  }

  async deleteSession(id: string): Promise<void> {
    this.sessions.delete(id);
  }

  async listSessions(_userId?: string): Promise<Session[]> {
    return Array.from(this.sessions.values())
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }
}
