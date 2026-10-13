# 代码风格约定

## 组件命名

- PascalCase，如 `OrderList.jsx`
- 一个页面一个目录，目录下可包含子组件

## 文件组织

```
pages/
└── [模块名]/
    ├── index.jsx      # 页面入口
    └── components/    # 页面私有组件（按需）
```

## 样式方案

- 优先使用 antd 组件自带样式 + CSS Modules
- 避免全局样式污染

## 注释规范

- 只在复杂业务逻辑处添加注释
- 不做冗余注释

## Hooks 使用

| Hook | 用途 |
|------|------|
| `useState` | 管理组件内部状态 |
| `useEffect` | 处理副作用 |
| `useContext` | 获取全局状态（如标签页状态） |
| `useMemo` / `useCallback` | 仅在性能确实需要时使用 |

## antd 组件使用

- 直接使用，不做二次封装（除非有明确的复用需求）
- 使用主题色 `#FF6B00` 作为主色调
