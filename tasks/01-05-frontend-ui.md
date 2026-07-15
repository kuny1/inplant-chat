# T1.5 前端 UI

**状态**：✅ 已完成
**依赖**：无
**可并行**：是

## 产出文件

- `frontend/index.html`（单文件，内联 CSS + JS）

## 实现要点

### 视觉设计

- **工业风格配色**：深蓝灰背景(#1a1d23) + 卡片(#262a33) + 强调色(#4fc3f7) + 状态三色(绿正常/黄警告/红异常)
- **两栏布局**：左侧 260px 会话列表 + 右侧聊天区 flex:1 + 底部固定输入框
- **CSS 变量**：所有颜色集中定义在 `:root`，方便后续主题切换

### 三种消息渲染模式

| 消息类型 | 视觉呈现 | 触发条件 |
|---------|---------|---------|
| 用户消息 | 右对齐蓝底气泡 | 每次发送 |
| Agent 步骤 | 左侧状态条，含圆点动画（黄色脉冲→绿色/红色） | SSE `event:step` |
| Agent 回答 | 左对齐白色气泡 + 底部来源引用卡片 | SSE `event:content` + `event:done` |
| 拒答消息 | 橙色边框卡片 | Guard 拦截时，SSE 直接返回文本 |

### SSE 流式渲染逻辑

```
Send → POST /api/chat (stream:true)
     → ReadableStream.getReader() 逐块读取
     → 解析 SSE 协议（event: / data: 行）
     → event:step   → updateStep() 更新步骤条（新建或更新已有步骤的 dot 颜色）
     → event:content → answerEl.textContent += delta（累加文本）
     → event:done   → 渲染 sources 卡片 + 更新会话列表
```

### 交互细节

- **Enter 发送 / Shift+Enter 换行**：标准聊天应用交互
- **发送中禁用输入**：`isStreaming` 状态锁，防止重复提交
- **步骤实时更新**：同一 key（type+name）的步骤复用 DOM 节点，只更新 dot 颜色，不重复创建
- **自动滚动**：每次 DOM 更新后 scrollToBottom
- **会话列表**：内存数组管理，新建会话或收到 done 事件时更新
- **textarea 自适应高度**：监听 input 事件调整 height，最大 120px

### 降级处理

- 网络错误：显示 "网络请求失败，请检查服务是否正常运行"
- SSE 解析错误：try-catch 包裹 JSON.parse，部分 chunk 解析失败不影响后续
- 空 sources：done 事件中 sources 为空时不渲染来源卡片

## 验收标准

- [x] 单文件可独立渲染，通过后端 serve 正常访问
- [x] SSE 三步渲染（step → content → done）正常工作
- [x] 步骤状态实时更新（running → completed / error）
- [x] 基础响应式可用
