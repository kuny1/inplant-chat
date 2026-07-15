import { BaseTool } from "./registry.js";
import type { ToolResult } from "../types.js";
import { readFileSync } from "fs";
import { join } from "path";

interface SensorData {
  id: string;
  name: string;
  location: string;
  unit: string;
  normalRange: [number, number];
  currentValue: number;
  updatedAt: string;
}

/**
 * 测点查询工具 — 查询聚合反应釜实时传感器数据
 *
 * ## LLM 调用场景
 * - 用户询问某个测点的当前值（"T-101 是多少？"）
 * - 用户询问某位置的所有测点（"夹套有哪些温度测点？"）
 * - 需要结合实时数据诊断设备异常（"R-101 温度正常吗？"）
 *
 * ## 数据来源
 * data/sensors.json（启动时加载到内存），模拟 DCS/SCADA 系统。
 * EXTEND: 对接真实 OPC UA / Modbus → TimescaleDB 数据源。
 *
 * ## 状态自动判断
 * 返回值中自动判断测点状态:
 * - normal: currentValue 在 normalRange 内
 * - warning: 低于下限
 * - critical: 超出上限
 * 异常时附加中文提示文本，LLM 可直接用于回答。
 */
export class SensorTool extends BaseTool {
  name = "sensor_query";
  description =
    "查询聚合反应釜传感器测点数据。可查询指定测点编号、指定位置或全部测点。" +
    "返回测点名称、当前值、单位、正常范围以及是否异常的判断。" +
    "当用户询问温度、压力、液位、流量、转速等实时数据时使用此工具。";
  parameters = {
    type: "object",
    properties: {
      pointId: {
        type: "string",
        description: "测点编号，如 T-101、P-101",
      },
      location: {
        type: "string",
        description: "测点位置关键词，如 釜体、夹套、缓冲罐",
      },
      all: {
        type: "boolean",
        description: "是否返回全部测点数据",
      },
    },
  };

  private sensorData: SensorData[];

  constructor(dataDir: string) {
    super();
    const raw = readFileSync(join(dataDir, "sensors.json"), "utf-8");
    this.sensorData = JSON.parse(raw) as SensorData[];
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    let filtered = this.sensorData;

    // 按条件过滤
    if (args.pointId) {
      const id = (args.pointId as string).toUpperCase();
      filtered = filtered.filter((s) => s.id === id);
    }
    if (args.location) {
      const loc = args.location as string;
      filtered = filtered.filter((s) => s.location.includes(loc));
    }
    // pointId、location、all 都没给 → 返回全部（LLM 想全面了解状态时）

    // 格式化输出并判断状态
    const points = filtered.map((s) => {
      const [min, max] = s.normalRange;
      let status: "normal" | "warning" | "critical" = "normal";
      let message = "正常";

      if (s.currentValue > max) {
        status = "critical";
        message = `⚠️ 当前值 ${s.currentValue}${s.unit} 超出正常范围上限 ${max}${s.unit}，偏差 +${(s.currentValue - max).toFixed(1)}${s.unit}`;
      } else if (s.currentValue < min) {
        status = "warning";
        message = `⚠️ 当前值 ${s.currentValue}${s.unit} 低于正常范围下限 ${min}${s.unit}，偏差 ${(s.currentValue - min).toFixed(1)}${s.unit}`;
      }

      return {
        id: s.id,
        name: s.name,
        location: s.location,
        value: s.currentValue,
        unit: s.unit,
        normalRange: s.normalRange,
        status,
        message,
        updatedAt: s.updatedAt,
      };
    });

    return {
      toolCallId: (args._toolCallId as string) ?? "",
      name: this.name,
      content: JSON.stringify({ points, total: points.length }),
    };
  }
}
