# Apifox API Codegen for React + TypeScript + Vite

这个项目已经补齐了一条完整的接口生成链路：

**Apifox 导出 OpenAPI** → **同步到本地** → **生成 TypeScript 类型** → **生成 Axios 请求层** → **生成 React Query hooks**

## 快速开始

1. 在项目根目录创建并编辑 `apifox.config.jsonc`（用于同步 OpenAPI）：

```json
{
  "openapiUrl": "https://api.apifox.com/api/v1/projects/{projectId}/export-openapi",
  "openapiFile": "",
  "requestMethod": "POST",
  "requestBody": {
	"scope": { "type": "ALL", "excludedByTags": [] },
	"options": { "includeApifoxExtensionProperties": false, "addFoldersToTags": false },
	"oasVersion": "3.0",
	"exportFormat": "JSON"
  },
  "token": "",
  "authHeader": "",
  "headers": { "X-Apifox-Api-Version": "2024-03-28" },
  "outputFile": "src/api/generated/apifox-openapi.json"
}
```

2. 执行一次同步与生成：

```powershell
npm run api:regen
```

3. 启动项目：

```powershell
npm run dev
```

## 脚本目录约定

- `scripts/apifox/`：Apifox 同步与代码生成相关脚本
- 后续新增脚本按领域分目录，避免所有脚本堆在 `scripts/` 根目录

## Apifox 配置文件

- `openapiUrl`：Apifox 的 OpenAPI 导出地址
- `openapiFile`：本地 OpenAPI 文件路径（优先于 `openapiUrl`）
- `requestMethod`：请求方法，默认 `GET`
- `requestBody`：请求体（对象或 JSON 字符串，通常用于 `POST` 导出接口）
- `token`：导出接口需要鉴权时使用的令牌
- `authHeader`：如果不是 `Bearer`，可自定义鉴权头值前缀
- `headers`：额外请求头对象
- `outputFile`：同步后的 OpenAPI 文件输出位置

## 环境变量（仅运行时）

- `VITE_API_BASE_URL`：前端运行时请求基础地址
- `VITE_API_WITH_CREDENTIALS`：是否携带 Cookie
- `VITE_API_AUTH_TOKEN_KEY`：从 localStorage 读取 token 的 key

## 生成结果

生成后的文件会落在：

- `src/api/generated/schema.ts`
- `src/api/generated/client.ts`
- `src/api/generated/hooks.ts`
- `src/api/generated/index.ts`

业务代码中可以直接从 `src/api` 引入请求层、QueryClient 和后续生成内容。

## 业务中如何使用

生成完成后，可以这样引入：

```ts
import { queryClient } from './api'
import { usePostXXXIndex } from './api/generated'
```

> 具体 hook 名称取决于 Apifox 里每个接口的 `operationId` 或路径自动推导结果。

