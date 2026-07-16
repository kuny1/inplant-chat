import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { config } from "./config";
import { createLLMClient } from "./llm/client";
import { loadDocuments } from "./rag/loader";
import { MemoryStore } from "./memory/store";
import { PgVectorStore } from "./memory/pg-store";
import type { SessionStore } from "./memory/store";
import { ToolRegistry } from "./tools/registry";
import { KnowledgeTool } from "./tools/knowledge";
import { SensorTool } from "./tools/sensor";
import { ReactAgent } from "./agent";
import { createApp } from "./app";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function initStore(): Promise<SessionStore> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.log("  (未配置 DATABASE_URL，使用内存存储)");
    return new MemoryStore();
  }

  const pool = new pg.Pool({ connectionString: dbUrl });

  // 尝试连接并执行 init.sql
  try {
    const client = await pool.connect();
    try {
      const sql = readFileSync(
        join(__dirname, "..", "..", "..", "db", "init.sql"),
        "utf-8"
      );
      await client.query(sql);
      console.log("✓ PostgreSQL 连接成功，schema 已就绪");
    } finally {
      client.release();
    }
    return new PgVectorStore(pool);
  } catch (err) {
    console.warn("  PostgreSQL 连接失败，降级为内存存储:", (err as Error).message);
    await pool.end();
    return new MemoryStore();
  }
}

async function main() {
  console.log("╔══════════════════════════════════════╗");
  console.log("║   InPlant Chat MVP — 聚合反应釜助手  ║");
  console.log("╚══════════════════════════════════════╝\n");

  // 1. LLM 客户端
  const llm = createLLMClient();
  console.log("✓ LLM 客户端已初始化");

  // 2. 加载文档
  const docsDir = join(__dirname, "..", "data", "documents");
  const documents = loadDocuments(docsDir);
  const chunkCount = documents.reduce((sum, d) => sum + d.chunks.length, 0);
  console.log(`✓ 已加载 ${documents.length} 篇文档（${chunkCount} 个块）`);

  // 3. 工具注册
  const registry = new ToolRegistry();
  registry.register(new KnowledgeTool(documents));
  registry.register(new SensorTool(join(__dirname, "..", "data")));
  console.log(
    `✓ 已注册 ${registry.list().length} 个工具: ${registry.list().join(", ")}`
  );

  // 4. 会话存储（PostgreSQL 优先，降级到内存）
  const store = await initStore();

  // 5. Agent
  const agent = new ReactAgent(llm, registry);

  // 6. 组装应用
  const app = await createApp();
  app.decorate("di", { store, agent });

  // 7. 启动
  await app.listen({ port: config.port, host: "0.0.0.0" });
  console.log(`\n🚀 服务已启动: http://localhost:${config.port}`);
  console.log(`   模型: ${config.deepseek.model}`);
  console.log(`   存储: ${store instanceof MemoryStore ? "内存" : "PostgreSQL"}\n`);
}

main().catch((err) => {
  console.error("启动失败:", err);
  process.exit(1);
});
