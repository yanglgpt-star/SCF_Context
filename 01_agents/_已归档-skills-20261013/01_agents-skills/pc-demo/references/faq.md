# 常见问题修复记录

记录历史 bug 修复经验，避免重复踩坑。

---

## findLabel 函数递归问题

菜单递归查找 label 时，找不到应返回 `null` 而非 `key`，避免 truthy 值导致提前返回。

```jsx
// 错误：返回 key 可能导致外层误判
function findLabel(key, items) {
  for (const item of items) {
    if (item.key === key) return item.label
    if (item.children) {
      const found = findLabel(key, item.children)
      if (found) return found  // 错误：key 本身是 truthy
    }
  }
  return key  // 错误
}

// 正确：找不到返回 null
function findLabel(key, items) {
  for (const item of items) {
    if (item.key === key) return item.label
    if (item.children) {
      const found = findLabel(key, item.children)
      if (found) return found
    }
  }
  return null  // 正确
}
```

---

## 路由 path 与菜单 key 一致性

App.jsx 中的 Route path 必须与菜单 key 完全一致，包括前导斜杠：

| 类型 | 示例 |
|------|------|
| 菜单 key | `/purchase/order` |
| 路由 path | `/purchase/order`（不是 `purchase/order`） |

---

## 标签页状态管理

标签页关闭时需判断是否为最后一个可关闭标签，避免关闭后 `activeKey` 指向不存在的标签。
