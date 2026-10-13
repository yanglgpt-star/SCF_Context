# CLAUDE.md

本文件为 Claude Code 工作目录指南。

## 语言约束

本项目默认使用简体中文，新增/更新的 skill、规则、记忆等文件应该使用简体中文（可允许部分必须要英文字母的表述，如 API、URL、ID 等）。

## 项目概述

这是一个产品经理的 Claude Code 工作空间，用于：
- 需求分析（requirements-analysis）
- 撰写 PRD（prd-writer）
- 构建 PC 端供应链管理后台 Demo（pc-demo）

**工作流程**：需求分析 → PRD 撰写 → PC 端 Demo 开发

## 目录结构

```
pm_agent/
├── CLAUDE.md              # 本文件
├── prd/                   # PRD 文档目录
├── pc/                    # PC 端供应链管理后台 Demo
│   ├── CLAUDE.md          # PC 项目指南
│   └── src/               # 项目源码
└── .claude/
    └── skills/            # Claude Code 技能目录
        ├── prd-writer/           # PRD 撰写技能
        ├── requirements-analysis/ # 需求分析技能
        └── pc-demo/              # PC 端 Demo 构建技能
```

## 技能说明

### requirements-analysis（需求分析）
当用户提到"需求分析"、"分析需求"、"撰写需求分析"、"需求调研"时使用。在 PRD 撰写前进行需求调研、分析和确认。

### prd-writer（PRD 撰写）
当用户提到"写PRD"、"撰写需求"、"产品需求"、"需求背景"、"功能设计"、"撰写产品需求文档"时使用。根据标准模板输出，包含需求背景、目标、流程图、功能清单、系统改造等章节。

### pc-demo（PC 端 Demo）
当用户提到"PC后台"、"供应链后台"、"后台页面"、"新增页面"、"添加菜单"、"PC端开发"、"后台列表"、"后台详情"、"管理后台"、"新建页面"、"开发页面"、"页面模板"等关键词时使用。即使用户只是简单提到要做一个后台页面或管理界面，也应该触发此 skill。

