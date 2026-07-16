-- InPlant Chat — 数据库初始化
-- PostgreSQL 18 + pgvector

CREATE EXTENSION IF NOT EXISTS vector;

-- 用户
CREATE TABLE IF NOT EXISTS users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255),
    preferences JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 会话
CREATE TABLE IF NOT EXISTS sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id),
    title           VARCHAR(500) DEFAULT '新会话',
    context_summary TEXT,
    message_count   INT DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 消息
CREATE TABLE IF NOT EXISTS messages (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id  UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role        VARCHAR(50) NOT NULL,
    content     TEXT NOT NULL,
    metadata    JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_session
    ON messages (session_id, created_at);

-- 消息向量（语义检索历史对话）
CREATE TABLE IF NOT EXISTS message_embeddings (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id  UUID REFERENCES messages(id) ON DELETE CASCADE,
    session_id  UUID REFERENCES sessions(id) ON DELETE CASCADE,
    chunk_index INT DEFAULT 0,
    content     TEXT NOT NULL,
    embedding   VECTOR(1536),
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_msg_emb ON message_embeddings
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

-- Agent 执行轨迹（P1 — 表已建，等待写入逻辑）
CREATE TABLE IF NOT EXISTS agent_traces (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id   UUID REFERENCES sessions(id),
    step_type    VARCHAR(50),
    step_name    VARCHAR(255),
    step_status  VARCHAR(50),
    tool_name    VARCHAR(255),
    error_msg    TEXT,
    tokens_used  JSONB,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- demo 用户种子数据
INSERT INTO users (id, name, preferences)
VALUES ('00000000-0000-0000-0000-000000000001', 'demo-user', '{"expertise":"操作工","common_devices":["R-101"]}')
ON CONFLICT (id) DO NOTHING;
