# 工具系统设计

> 最后更新：2026-07-15 | 版本：0.1.0

## 一、BaseTool 抽象类

每个工具必须声明四个契约字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| name | string | 全局唯一函数名，LLM function calling 使用 |
| description | string | LLM 判断何时调用的依据，需具体描述使用场景 |
| parameters | JSON Schema | 输入参数的类型和约束 |
| execute(args) | async → ToolResult | 实际业务逻辑 |

元数据由 ToolRegistry 自动转为 OpenAI function calling 格式。

## 二、ToolRegistry

```
class ToolRegistry
  register(tool: BaseTool)        // 注册工具实例，同名冲突抛异常
  getDefinitions() → ToolDefinition[]  // 输出 OpenAI function calling 格式
  execute(name, args) → ToolResult     // 按 name 路由执行，异常不抛
  list() → string[]                    // 调试用
```

错误处理：`execute()` 不抛异常，错误包装在 `ToolResult.error` 中返回。Agent 可根据错误决定重试/跳过/告知用户。

## 三、6 个工具总览

| 工具 | 状态 | 副作用 | 补偿操作 |
|------|------|--------|---------|
| knowledge_query | ✅ 完整 | 无 | — |
| sensor_query | ✅ 完整 | 无 | — |
| chatbi_query | 🔲 占位 | 无 | — |
| alarm_query / alarm_acknowledge | 🔲 占位 | 有(acknowledge) | unacknowledge |
| task_query / task_create / task_update | 🔲 占位 | 有(create/update) | delete / revert |
| translate | 🔲 占位(LLM直调) | 无 | — |

## 四、工具 JSON Schema

### knowledge_query

```json
{
  "name": "knowledge_query",
  "description": "搜索聚合反应釜知识库。当用户询问设备结构、工作原理、操作规范、工艺参数、安全事项、故障诊断、维护保养等问题时使用此工具。返回最相关的文档段落及其来源。",
  "parameters": {
    "type": "object",
    "properties": {
      "question": { "type": "string", "description": "检索关键词" },
      "topK": { "type": "number", "description": "返回数量，默认3，最大5" }
    },
    "required": ["question"]
  }
}
```

### sensor_query

```json
{
  "name": "sensor_query",
  "description": "查询聚合反应釜传感器测点数据。可查询指定测点编号、指定位置或全部测点。返回测点名称、当前值、单位、正常范围以及是否异常的判断。当用户询问温度、压力、液位、流量、转速等实时数据时使用此工具。",
  "parameters": {
    "type": "object",
    "properties": {
      "pointId": { "type": "string", "description": "测点编号，如 T-101" },
      "location": { "type": "string", "description": "位置关键词，如 釜体、夹套" },
      "all": { "type": "boolean", "description": "是否返回全部测点" }
    }
  }
}
```

### alarm_query（占位）

```json
{
  "name": "alarm_query",
  "description": "查询聚合反应釜的报警信息。可查询当前活跃报警、历史报警记录，按严重程度或时间段筛选。也可确认报警。",
  "parameters": {
    "type": "object",
    "properties": {
      "action": { "type": "string", "enum": ["query", "acknowledge"] },
      "status": { "type": "string", "enum": ["active", "acknowledged", "resolved"] },
      "severity": { "type": "string", "enum": ["warning", "critical", "emergency"] },
      "alarmId": { "type": "string" },
      "operator": { "type": "string" }
    },
    "required": ["action"]
  }
}
```

### task_query（占位）

```json
{
  "name": "task_query",
  "description": "管理聚合反应釜的维护工单和操作任务。可查询、创建、更新工单状态。",
  "parameters": {
    "type": "object",
    "properties": {
      "action": { "type": "string", "enum": ["query", "create", "update"] },
      "taskId": { "type": "string" },
      "status": { "type": "string", "enum": ["pending", "in_progress", "completed", "cancelled"] },
      "title": { "type": "string" },
      "description": { "type": "string" },
      "priority": { "type": "string", "enum": ["P0", "P1", "P2", "P3"] },
      "assignee": { "type": "string" }
    },
    "required": ["action"]
  }
}
```

### chatbi_query（占位）

```json
{
  "name": "chatbi_query",
  "description": "用自然语言查询聚合反应釜的运行数据，支持统计分析。",
  "parameters": {
    "type": "object",
    "properties": {
      "question": { "type": "string", "description": "自然语言查询" },
      "dataType": { "type": "string", "enum": ["sensor", "alarm", "task"] }
    },
    "required": ["question"]
  }
}
```

### translate（占位）

```json
{
  "name": "translate",
  "description": "将文本翻译为目标语言。支持中英文互译，保持化工专业术语准确性。",
  "parameters": {
    "type": "object",
    "properties": {
      "text": { "type": "string", "description": "要翻译的文本" },
      "targetLang": { "type": "string", "enum": ["en", "zh"] }
    },
    "required": ["text", "targetLang"]
  }
}
```

## 五、Saga 补偿设计

工具按副作用分为两类：

**只读工具**（无副作用）：knowledge_query, sensor_query, chatbi_query(只读), alarm_query, task_query, translate
→ 无需补偿

**写工具**（有副作用）：alarm_acknowledge, task_create, task_update
→ 需注册 compensatingAction

| 操作 | 副作用 | 补偿操作 | 注意事项 |
|------|--------|---------|---------|
| alarm_acknowledge | 报警状态 raised→acknowledged | alarm_unacknowledge → 状态回退 | 补偿失败记录到日志，人工介入 |
| task_create | 新增工单 | task_delete → 删除工单 | 新工单无历史依赖，可直接删 |
| task_update | 修改工单状态 | task_revert → 写回旧状态 | 需在 Saga 日志 detail 中存储旧状态快照 |

## 六、新增工具开发指南

```
1. 在 src/tools/ 下新建文件
2. class XxxTool extends BaseTool { 实现 name/description/parameters/execute }
3. 在 main.ts 中 registry.register(new XxxTool(...))
4. 完成。Agent 自动发现，LLM 根据 description 自动判断调用时机
```

无需改 Agent 代码、无需改路由、无需改 prompt。
