import { config } from "./config.js";
import { createLLMClient } from "./llm/client.js";
import { loadDocuments } from "./rag/loader.js";
import { embedDocuments } from "./rag/embedder.js";
import { MemoryStore } from "./memory/store.js";
import { ToolRegistry } from "./tools/registry.js";
import { KnowledgeTool } from "./tools/knowledge.js";
import { SensorTool } from "./tools/sensor.js";
import { ReactAgent } from "./agent.js";
import { createApp } from "./app.js";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  console.log("╔══════════════════════════════════════╗");
  console.log("║   InPlant Chat MVP — 聚合反应釜助手  ║");
  console.log("╚══════════════════════════════════════╝\n");

  // 1. LLM 客户端
  const llm = createLLMClient();
  console.log("✓ LLM 客户端已初始化");

  // 2. 加载并向量化文档
  const docsDir = join(__dirname, "..", "data", "documents");
  const documents = loadDocuments(docsDir);
  console.log(`✓ 已加载 ${documents.length} 篇文档`);

  const chunkCount = documents.reduce((sum, d) => sum + d.chunks.length, 0);
  await embedDocuments(documents, llm);
  console.log(`✓ 文档向量化完成（${chunkCount} 个块）`);

  // 3. 工具注册
  const registry = new ToolRegistry();
  registry.register(new KnowledgeTool(documents, llm));
  registry.register(new SensorTool(join(__dirname, "..", "data")));
  console.log(
    `✓ 已注册 ${registry.list().length} 个工具: ${registry.list().join(", ")}`
  );

  // 4. 会话存储
  const store = new MemoryStore();

  // 5. Agent
  const agent = new ReactAgent(llm, registry);

  // 6. 组装应用
  const app = await createApp();

  // 依赖注入（简化版：挂到 fastify 实例上）
  app.decorate("di", { store, agent });

  // 7. 启动
  await app.listen({ port: config.port, host: "0.0.0.0" });
  console.log(`\n🚀 服务已启动: http://localhost:${config.port}`);
  console.log(`   模型: ${config.deepseek.model}`);
  console.log(`   环境: development\n`);
}

main().catch((err) => {
  console.error("启动失败:", err);
  process.exit(1);
});
