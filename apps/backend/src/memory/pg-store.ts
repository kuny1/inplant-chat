import { randomUUID } from "crypto";
import type { Pool, PoolClient } from "pg";
import type { Message, Session } from "../types";
import type { MessageRole } from "@inplant/shared";
import { type SessionStore, DEMO_USER_ID } from "./store";

interface SessionRow {
  id: string;
  user_id: string;
  title: string;
  context_summary?: string | null;
  created_at: Date;
  updated_at: Date;
  message_count?: number;
}

interface MessageRow {
  id: string;
  session_id: string;
  role: MessageRole;
  content: string;
  metadata: Record<string, unknown> | undefined;
  created_at: string;
}

export class PgVectorStore implements SessionStore {
  constructor(private pool: Pool) {}

  async createSession(userId?: string): Promise<Session> {
    const id = randomUUID();
    await this.pool.query(
      `INSERT INTO sessions (id, user_id) VALUES ($1, $2)`,
      [id, userId || DEMO_USER_ID]
    );
    return {
      id,
      userId: userId || DEMO_USER_ID,
      title: "新会话",
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  async getSession(id: string): Promise<Session | undefined> {
    const { rows } = await this.pool.query(
      `SELECT id, user_id, title, context_summary, created_at, updated_at
       FROM sessions WHERE id = $1`,
      [id]
    );
    if (rows.length === 0) return undefined;

    const r = rows[0];
    const messages = await this.getMessages(id, 50);
    return {
      id: r.id,
      userId: r.user_id,
      title: r.title,
      contextSummary: r.context_summary,
      messages,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  async updateSession(
    id: string,
    fields: { title?: string; contextSummary?: string }
  ): Promise<void> {
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (fields.title !== undefined) {
      sets.push(`title = $${i++}`);
      vals.push(fields.title);
    }
    if (fields.contextSummary !== undefined) {
      sets.push(`context_summary = $${i++}`);
      vals.push(fields.contextSummary);
    }
    if (sets.length === 0) return;
    sets.push(`updated_at = NOW()`);
    vals.push(id);
    await this.pool.query(
      `UPDATE sessions SET ${sets.join(", ")} WHERE id = $${i}`,
      vals
    );
  }

  async addMessage(sessionId: string, message: Message): Promise<void> {
    await this.pool.query(
      `INSERT INTO messages (id, session_id, role, content, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        message.id,
        sessionId,
        message.role,
        message.content,
        JSON.stringify(message.metadata ?? {}),
        new Date().toISOString(),
      ]
    );

    // 更新会话的 message_count 和 updated_at
    await this.pool.query(
      `UPDATE sessions SET message_count = message_count + 1, updated_at = NOW()
       WHERE id = $1`,
      [sessionId]
    );

    // 自动标题
    if (message.role === "user") {
      const { rows } = await this.pool.query(
        `SELECT message_count, title FROM sessions WHERE id = $1`,
        [sessionId]
      );
      if (rows[0]?.message_count === 1 && rows[0]?.title === "新会话") {
        const t = message.content.slice(0, 30);
        const title = t + (message.content.length > 30 ? "..." : "");
        await this.pool.query(
          `UPDATE sessions SET title = $1 WHERE id = $2`,
          [title, sessionId]
        );
      }
    }
  }

  async getMessages(
    sessionId: string,
    limit = 10
  ): Promise<Message[]> {
    const { rows } = await this.pool.query(
      `SELECT id, session_id, role, content, metadata, created_at
       FROM messages
       WHERE session_id = $1
       ORDER BY created_at ASC
       LIMIT $2`,
      [sessionId, limit]
    );

    return rows.map((r: MessageRow) => ({
      id: r.id,
      sessionId: r.session_id,
      role: r.role,
      content: r.content,
      metadata: r.metadata,
    }));
  }

  async deleteSession(id: string): Promise<void> {
    await this.pool.query(`DELETE FROM sessions WHERE id = $1`, [id]);
  }

  async listSessions(userId?: string): Promise<Session[]> {
    const { rows } = await this.pool.query(
      `SELECT id, user_id, title, context_summary, created_at, updated_at
       FROM sessions
       WHERE user_id = $1
       ORDER BY updated_at DESC
       LIMIT 50`,
      [userId || DEMO_USER_ID]
    );

    return rows.map((r: SessionRow) => ({
      id: r.id,
      userId: r.user_id,
      title: r.title,
      contextSummary: r.context_summary ?? undefined,
      messages: [],
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }
}
