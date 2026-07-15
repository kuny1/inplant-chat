import { BaseTool } from "./registry";
import type { ToolResult } from "../types";

/**
 * ChatBI 工具 — 自然语言查询设备运行数据
 *
 * ## 设计意图
 * ChatBI（Chat Business Intelligence）让用户用自然语言查询结构化数据，
 * 而不需要写 SQL。这是工业智能问答的核心差异化能力之一。
 *
 * ## 核心链路
 * 1. 用户 NL 问题 → LLM 生成 SQL
 * 2. SQL 执行（数据库/模拟数据）
 * 3. 结果格式化（表格/文本描述）
 * 4. 可选：生成可视化图表配置（echarts JSON）
 *
 * ## Text-to-SQL few-shot prompt 设计要点
 * - 提供 5-8 个 (问题, SQL) 示例覆盖常见模式：单表、时间范围、聚合、多条件、排序
 * - Schema 注入 prompt：表名、字段名、含义、数据类型、示例值
 * - 常见陷阱防御：
 *   - "平均温度" → AVG(value)，不是最新实时值
 *   - "最近一小时" → 必须加时间窗口 WHERE timestamp > NOW() - INTERVAL
 *   - "最高" → MAX(value) 而非 ORDER BY DESC LIMIT 1（语义正确性）
 *   - NULL 处理：无数据时间点的显示策略
 *
 * ## 与真实 DCS/SCADA 对接
 * OPC UA / Modbus → TimescaleDB（时序数据库）
 *   ├─ sensor_readings 表（point_id, value, timestamp）
 *   └─ alarm_events 表（alarm_id, type, timestamp, status）
 * ChatBI 工具 → 生成 SQL → 查询 TimescaleDB
 *
 * ## 当前状态
 * 占位实现，返回模拟 SQL 预览并引导用户使用 sensor_query。
 * 完整实现取决于真实数据源接入（P0 迭代路线图中的 pgvector 迁移同步进行）。
 */
export class ChatBITool extends BaseTool {
  name = "chatbi_query";
  description =
    "用自然语言查询聚合反应釜的运行数据，支持统计分析。" +
    "当用户询问历史趋势、统计数据（平均值、最大值、最小值）、某时间段的运行情况时使用。";
  parameters = {
    type: "object",
    properties: {
      question: {
        type: "string",
        description:
          "用自然语言描述的查询需求，如「最近24小时T-101的平均温度」",
      },
      dataType: {
        type: "string",
        enum: ["sensor", "alarm", "task"],
        description: "查询的数据类型",
      },
    },
    required: ["question"],
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const dataType = (args.dataType as string) || "sensor";

    const mockSQL =
      dataType === "alarm"
        ? `-- 模拟：最近24小时报警统计
SELECT severity, COUNT(*) as count
FROM alarm_events
WHERE device_id = 'R-101'
  AND raised_at > NOW() - INTERVAL '24 hours'
GROUP BY severity
ORDER BY count DESC;`
        : `-- 模拟：T-101温度历史趋势
SELECT timestamp, value
FROM sensor_readings
WHERE point_id = 'T-101'
  AND timestamp > NOW() - INTERVAL '1 hour'
ORDER BY timestamp DESC
LIMIT 100;`;

    return {
      toolCallId: (args._toolCallId as string) ?? "",
      name: this.name,
      content: JSON.stringify({
        message:
          "ChatBI 模块将在后续版本上线。当前支持聚合反应釜的测点数据实时查询，" +
          "请使用 sensor_query 工具获取最新数据。对于统计类查询，请暂时参考以下模拟结果。",
        preview: {
          generatedSQL: mockSQL,
          note: "以上为 Text-to-SQL 功能的模拟预览。上线后将连接 TimescaleDB 执行真实查询。",
        },
        suggestion: "请使用 sensor_query 工具查看实时数据",
      }),
    };
  }
}
