import { config } from "./config";
import { createLLMClient } from "./llm/client";
import { loadDocuments } from "./rag/loader";
import { MemoryStore } from "./memory/store";
import { ToolRegistry } from "./tools/registry";
import { KnowledgeTool } from "./tools/knowledge";
import { SensorTool } from "./tools/sensor";
import { ReactAgent } from "./agent";
import { createApp } from "./app";
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
