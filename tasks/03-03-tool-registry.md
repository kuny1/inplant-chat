# T3.3 工具注册表

**状态**：✅ 已完成
**依赖**：T1.2（类型定义）
**可并行**：是（不依赖 Phase 3 其他任务）

## 产出文件

- `src/tools/registry.ts`

## 实现要点

### BaseTool 抽象类

每个工具必须声明四个契约字段：

```
abstract class BaseTool {
  abstract name: string          // 函数名，全局唯一，LLM function calling 用
  abstract description: string   // LLM 判断何时调用的依据，需描述使用场景
  abstract parameters: object    // JSON Schema，定义输入参数类型和约束
  abstract execute(args) → ToolResult  // 实际执行逻辑
}
```

子类只需填这四个字段，注册表自动处理格式转换和路由。

### ToolRegistry 核心方法

```
class ToolRegistry {
  register(tool)           // 注册工具实例，同名冲突抛异常
  getDefinitions()         // 遍历已注册工具 → 转为 OpenAI function calling 格式
  execute(name, args)      // 按 name 查 Map → 调 tool.execute(args)
  list()                   // 返回已注册名称列表（调试用）
}
```

**getDefinitions 的格式转换**：

```
BaseTool { name, description, parameters }
    ↓
ToolDefinition { type: "function", function: { name, description, parameters } }
```

直接对齐 OpenAI / DeepSeek function calling 协议，无需二次转换。

**execute 的错误处理**：

```
try:
  tool = map.get(name)
  if !tool → return ToolResult { error: "未找到工具" }
  result = tool.execute(args)
  return result
catch:
  return ToolResult { error: error.message }
```

不抛异常，错误包装在 `ToolResult.error` 中。Agent 可以根据 error 内容决定：重试 / 跳过 / 告知用户。

### 新增工具的零摩擦流程

```
1. class XxxTool extends BaseTool { ... }    // 实现业务逻辑
2. registry.register(new XxxTool(...))       // 注册
3. 完成。Agent 自动发现，LLM 自动识别调用时机
```

不需要改 Agent 代码、不需要改路由、不需要改 prompt（工具的 description 就是 LLM 的决策依据）。

### 预留扩展（注释形式）

- **工具权限**：添加 `allowedRoles` 字段，限制不同角色（操作工/技术员/管理员）可调用的工具
- **副作用声明**：添加 `hasSideEffects` + `compensatingAction`，用于 Saga 回滚：task_create → compensatingAction: task_delete
- **热加载**：watch 目录，文件变更自动 re-register

## 验收标准

- [x] BaseTool 强制声明 name/description/parameters
- [x] getDefinitions() 输出符合 OpenAI function calling 格式
- [x] execute() 异常不抛，包装在 ToolResult.error 中
- [x] 注释包含权限、副作用、热加载的扩展方向
