# 🚀 Apifox Vite React TypeScript Starter

> 一个现代化的 **React + TypeScript + Vite** 项目模板，集成了 **Apifox API 代码自动生成** 工作流。

## ✨ 主要特性

- 🔥 **热更新 (HMR)** - Vite 提供的极速开发体验
- 📘 **TypeScript** - 完整的类型支持
- 🎯 **API 代码生成** - 从 Apifox OpenAPI 规范自动生成 TypeScript 类型、Axios 请求层和 React Query Hooks
- 📦 **最佳实践** - ESLint 代码检查、TanStack Query 状态管理
- ⚡ **轻量快速** - 基于 Vite 5 和 React 19

## 🛠️ 技术栈

| 类别           | 技术                           |
|--------------|------------------------------|
| **框架**       | React 19                     |
| **构建工具**     | Vite 5                       |
| **语言**       | TypeScript 5.9               |
| **HTTP 客户端** | Axios                        |
| **状态管理**     | TanStack Query (React Query) |
| **API 集成**   | Apifox OpenAPI 代码生成          |

## 📜 核心功能

项目实现了完整的 API 接口生成链路：

```
Apifox 导出 OpenAPI 
    ↓
同步到本地 
    ↓
生成 TypeScript 类型 
    ↓
生成 Axios 请求层 
    ↓
生成 React Query hooks
```

让前端开发者无需手动编写重复的 API 请求代码，专注于业务逻辑开发。

## 🎯 适用场景

- 需要与后端 API 频繁交互的 React 项目
- 使用 Apifox 进行 API 管理的团队
- 追求类型安全和开发效率的前端项目


## 🚀 快速开始

在```apifox.config.jsonc```中配置以下信息

1. 项目id```projectId```

2. 项目的模块id```moduleId```

3. Apifox的个人访问令牌```token```

然后运行以下命令：

```bash
npm run api:regen
```

生成的代码会被放在```src/api/generated```目录下, 该目录已被git忽略, 不会被提交到版本控制系统中, 每次运行命令都会根据Apifox的内容重新生成代码, 请勿手动修改该目录下的文件, 以免被覆盖

## 脚本介绍

1. ```sync-apifox-spec.mjs```

从 Apifox 同步 OpenAPI 规范到本地, 拉取的接口信息会被保存在```src/api/generated/apifox-openapi.json```文件中


2. ```generate-api.mjs```

读取```apifox-openapi.json```文件内容, 生成 TypeScript 类型、Axios 请求层和 React Query hooks, 生成的代码会被保存在```src/api/generated```目录下

生成的文件包括(均不可手动修改, 会根据Apifox内容每次重新生成) ：

| 文件名           | 作用                                  |
|---------------|-------------------------------------|
| **client.ts** | 封装Axios的接口                          |
| **hooks.ts**  | 基于TanStack Query封装的hooks            |
| **index.ts**  | 统一导出的文件                             |
| **schema.ts** | 由 OpenAPI 规范自动生成的 TypeScript 类型定义文件 |
| **types.ts**  | 接口相关的类型文件                           |


