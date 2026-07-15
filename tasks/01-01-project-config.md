# T1.1 项目配置

**状态**：✅ 已完成
**依赖**：无
**可并行**：是

## 产出文件

- `package.json`
- `tsconfig.json`
- `.env.example`

## 实现要点

### 运行环境
- 项目类型为 ESM（`"type": "module"`），Node.js 18+
- 开发用 `tsx watch` 实现热重载，生产用 `tsc` 编译后 `node` 运行

### 依赖选型
- **Web 框架**：Fastify 5，性能优于 Express，插件体系成熟
- **LLM SDK**：openai 官方库，兼容 DeepSeek API（仅需改 baseURL）
- **工具链**：仅 tsx + typescript + @types/node，零配置

### TS 编译配置
- target ES2022 + module NodeNext，充分利用现代 Node 特性
- strict: true，从第一天就强制类型安全
- rootDir 限定 `src/`，避免编译测试/数据文件

### 环境变量模板
- 必填项：DEEPSEEK_API_KEY，缺失时启动不报错但首次调 API 时给出可操作的错误提示
- 预留项：QWEN_API_KEY / QWEN_BASE_URL / MODEL_PROVIDER，以注释形式存在

## 验收标准

- [x] `package.json` 包含全部必需依赖
- [x] `tsconfig.json` 编译配置正确
- [x] `.env.example` 覆盖所有配置项及未来预留
