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
