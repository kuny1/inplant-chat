# T4.2 校验 stub

**状态**：🔲 占位实现
**依赖**：T1.2（类型定义）
**可并行**：否

## 产出文件

- `src/validation/checker.ts`

## 实现要点

### 当前行为（MVP）

```
validateResponse(content, sources) → { safe: true, factual: true, confidence: 1.0, warnings: [] }
```

永远返回通过。函数签名和返回类型与完整实现完全一致，调用方代码无需改动。

### 设计注释中描述的完整管线

**两阶段校验**：

```
阶段1 — SafetyChecker（安全审查）
  目标: 确保输出不含有害、违规或严重误导内容

  管线:
    1. 敏感词正则扫描（硬编码词汇表，如攻击性语言、破坏性操作指令）
    2. 命中 → unsafe + 记录命中词 → 触发重新生成
    3. clean → 可选 LLM 二次审查（用小模型降成本）:
       system: "检查文本是否包含危险操作建议、违法内容或严重误导。
                仅回答 SAFE 或 UNSAFE: [原因]"
    4. UNSAFE → 返回安全提示文本替代原始回答

阶段2 — FactualityChecker（事实性校验）
  目标: 验证回答中的关键声明是否与检索到的来源一致

  管线:
    1. 提取关键声明（正则匹配数字范围、因果关系、操作步骤）
    2. 逐声明与 source texts 交叉验证（调 LLM）:
       system: "判断声明是否能被参考文本支持。
                声明: {claim}
                参考: {sourceText}
                仅回答: SUPPORTED / PARTIALLY_SUPPORTED / UNSUPPORTED"
    3. 每声明打分: SUPPORTED=1, PARTIAL=0.5, UNSUPPORTED=0
    4. confidence = mean(各声明得分)
    5. confidence < 0.7 → 追加不确定性声明
```

### 极端情况处理

| 情况 | 策略 |
|------|------|
| 回答为纯通用建议（"注意安全"） | 无声明可提取 → 跳过事实性校验 |
| 所有声明 UNSUPPORTED | confidence=0 → 标记严重警告，建议用户忽略此回答 |
| sources 为空（如拒答、"你好"闲聊） | 跳过事实性校验，confidence 保持默认值 |
| 安全审查 UNSAFE | 直接返回安全提示文本，不进行事实性校验 |

### 生产优化方向

- **用小模型做校验**：DeepSeek-lite 替代 DeepSeek-chat，延迟更低、成本更低
- **可观测性**：校验结果记录到 Langfuse，用于持续优化安全词汇表和校验 prompt
- **安全词汇表外置**：独立配置文件，运营人员无需改代码即可更新敏感词列表
- **声明提取升级**：从正则升级为简单 NER 模型，提高准确率和召回率

## 验收标准

- [x] always-pass，返回 `{ safe: true, factual: true }`
- [x] 设计注释中两阶段管线描述清晰
- [x] 极端情况的处理策略有明确说明
- [x] 注释包含生产优化方向（小模型、可观测、配置外置、NER）
