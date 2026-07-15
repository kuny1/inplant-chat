# T3.3 工具注册表

**状态**：✅ 完整实现
**依赖**：T1.2（类型定义）
**可并行**：是（不依赖 Phase 3 其他任务）

## 产出文件

- `src/tools/registry.ts`

## 实现内容

```typescript
import type { ToolDefinition, ToolResult } from "../types.js";

/**
 * 工具抽象基类
 *
 * ## 设计意图
 * 每个工具必须声明三个元数据字段：
 * - name: LLM function calling 中的函数名，全局唯一
 * - description: LLM 判断何时调用此工具的依据，需要描述清楚使用场景
 * - parameters: JSON Schema 定义输入参数，LLM 据此生成正确的参数
 *
 * 子类只需实现 execute() 方法，元数据即可被 ToolRegistry 自动转换为
 * OpenAI/DeepSeek function calling 格式。
 *
 * ## 新增工具步骤
 * 1. class XxxTool extends BaseTool { ... }
 * 2. registry.register(new XxxTool())
 * 3. 完成。Agent 自动发现，无需改其他代码。
 *
 * ## 未来扩展
 * - 工具权限：添加 allowedRoles 字段，限制操作工/技术员/管理员的可用工具
 * - 副作用声明：添加 hasSideEffects 字段，有副作用的工具注册 compensatingAction
 *   用于 Saga 回滚，如 task_create 的补偿是 task_delete
 * - 热加载：watch tools/ 目录，文件变更自动 re-register
 */
export abstract class BaseTool {
  abstract name: string;
  abstract description: string;
  abstract parameters: Record<string, unknown>;
  abstract execute(args: Record<string, unknown>): Promise<ToolResult>;

  /** EXTEND: 用户角色权限 */
  // abstract allowedRoles?: string[];

  /** EXTEND: Saga 补偿操作 */
  // abstract hasSideEffects?: boolean;
  // abstract compensate?(args: Record<string, unknown>): Promise<ToolResult>;
}

/**
 * 工具注册表 — 工厂模式管理所有工具
 *
 * ## 核心职责
 * 1. 注册/注销工具
 * 2. getDefinitions() → 生成 LLM function calling 格式的工具列表
 * 3. execute(name, args) → 根据 name 路由到对应工具执行
 *
 * ## 工具路由
 * 根据 LLM 返回的 tool_calls[].function.name 查 Map 获取工具实例，调用 execute()。
 */
export class ToolRegistry {
  private tools = new Map<string, BaseTool>();

  register(tool: BaseTool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`工具 "${tool.name}" 已注册`);
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * 生成 OpenAI function calling 格式的工具描述列表
   */
  getDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  /**
   * 根据名称执行工具
   * 错误不抛出，包装在 ToolResult.error 中返回，
   * 让 Agent 可以根据错误信息决定重试或跳过。
   */
  async execute(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        toolCallId: args._toolCallId as string ?? "",
        name,
        content: "",
        error: `未找到工具 "${name}"`,
      };
    }

    try {
      return await tool.execute(args);
    } catch (error) {
      return {
        toolCallId: args._toolCallId as string ?? "",
        name,
        content: "",
        error: error instanceof Error ? error.message : "工具执行异常",
      };
    }
  }

  /** 获取已注册工具名称列表（用于调试） */
  list(): string[] {
    return Array.from(this.tools.keys());
  }
}
```

## 验收标准

- [ ] BaseTool 抽象类强制声明 name/description/parameters
- [ ] getDefinitions() 输出符合 OpenAI function calling 格式
- [ ] execute() 异常不抛出，包装在 ToolResult.error 中
- [ ] 注释中包含权限、副作用、热加载的扩展方向
