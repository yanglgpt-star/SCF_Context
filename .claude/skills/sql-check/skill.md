---
name: sql-check
description: SQL脚本质量检查专家。当用户要求"检查SQL"、"SQL语句检查"、"语法检查"、"数据校验"、"SQL质量"、"审核SQL"时触发。支持INSERT/UPDATE/DELETE/TRUNCATE语句的语法检查、数据一致性校验、字段值匹配、浮点数精度、日期格式等全面检查。
---

# SQL 脚本质量检查专家

## 工作原则

1. **全面检查**：逐行扫描SQL文件，不遗漏任何语句
2. **分类报告**：按语法错误、数据一致性、精度问题、潜在风险分类
3. **精准定位**：报告时必须包含行号、问题描述、错误示例和正确写法
4. **不做修改**：只报告问题，不修改文件（除非用户明确要求修复）
5. **备份先行**：用户要求修复前，必须提醒备份原文件

---

## 检查清单

### 1. 基础语法检查

| 检查项 | 说明 | 验证方式 |
|-------|------|---------|
| 分号终止 | 每条语句是否以 `;` 结尾 | `grep -c "^UPDATE\|^INSERT"` 对比行数 |
| 引号匹配 | 单引号是否成对 | `content.count("'") % 2 == 0` |
| 括号匹配 | 左右括号数量一致 | 排除字符串内括号后比较 |
| 字符串引用 | 字符串值是否用单引号包裹 | grep 检查 `=` 后是否缺引号 |
| VALUES 括号 | `VALUES` 后是否缺少 `(` | `grep -cP "VALUES\s+'"` |

**常见错误模式**：

```sql
-- ❌ 缺少开引号
WHERE storage_order_no = DC202606040001';
-- ✅ 正确
WHERE storage_order_no = 'DC202606040001';

-- ❌ VALUES缺括号
VALUES 'value1', 'value2', ...;
-- ✅ 正确
VALUES ('value1', 'value2', ...);

-- ❌ WHERE连写
WHEREagreement_no = 'xxx';
-- ✅ 正确
WHERE agreement_no = 'xxx';
```

### 2. INSERT 字段与值匹配检查

| 检查项 | 说明 |
|-------|------|
| 列数=值数 | INSERT 定义的字段数必须等于 VALUES 中的值数 |
| 值类型匹配 | 字符串值用引号，数值不用引号 |

**方法**：提取 `(column1, column2, ...)` 中的字段列表，按 tab 分割 VALUES 值列表，比较数量。

```sql
-- ❌ 字段15个 vs 值18个（多出3个多余值）
INSERT INTO table (col1, col2, ...) VALUES (13, '', '', '', null, 'val1', ...);
-- ✅ 正确
INSERT INTO table (col1, col2, ...) VALUES (null, 'val1', ...);
```

### 3. 浮点数精度检查

| 检查项 | 说明 |
|-------|------|
| 超出2位小数 | 金额字段应保留2位小数，不允许 `678.199999999997` |
| 费率字段例外 | `service_rate`、`deposit_rate` 可使用多位小数（如 0.00025） |

**检测正则**：`(?<!\d)(\d+\.\d{3,})(?!\d)`，过滤掉以 `0.` 开头的费率值。

**常见浮点精度问题**：
```
678.199999999997  →  678.20
2836.79999999999  →  2836.80
456.600000000006  →  456.60
467.099999999977  →  467.10
```

### 4. 日期检查

| 检查项 | 说明 |
|-------|------|
| 1900年日期 | `'1900-xx-xx'` 为错误数据 |
| 月份/日期越界 | 月份 > 12 或日期 > 31 |
| 日期格式 | 所有日期字段应用引号包裹 |
| batch_no 日期 | 如 `CGSQ2026007030001` 年份异常（202600年） |

### 5. 数据一致性检查

| 检查项 | 说明 |
|-------|------|
| 跨文件关联 | 关联字段（如 `agreement_no`、`storage_order_no`）在各文件间是否一致 |
| 金额计算 | `service_amount`、`deposit_amount`、`min_sale_price` 是否满足公式 |
| stock_in_no 格式 | `ASN20260604xxxx` 是否正确（非 `ASN920260604xxxx`） |

**计算公式**：
- `deposit_amount = evaluate_price × sale_quantity × deposit_rate`
- `min_sale_price = sale_price - evaluate_price`
- `service_amount(pickup_type=1) = (sale_price - evaluate_price) × sale_quantity`
- `service_amount(pickup_type=2) = (sale_price - evaluate_price) × sale_quantity - storage_amount`

### 6. 其他检查

| 检查项 | 说明 |
|-------|------|
| 双引号 | SQL中不应出现双引号 `""` |
| 重复赋值 | 同一字段在SET中出现两次，如 `trigger_time = ..., trigger_time = ...` |
| 空值赋值 | `supplier_id = ,` 等号后无值 |
| 不完整语句 | `INSERT ... VALUES` 后无数据 |
| 逗号缺失 | tab分隔的值之间缺少逗号 |
| 全表UPDATE | 无WHERE条件的UPDATE是否预期 |

---

## 检查流程

```
1. 读取文件 → 获取总行数、语句类型和数量
2. 基础语法检查 → 分号/引号/括号/引号/VALUES括号
3. INSERT字段值匹配 → 逐条对比列数和值数
4. 浮点数精度 → 查找超2位小数的非费率值
5. 日期检查 → 1900年/越界/格式错误
6. 数据计算校验 → 抽样验证金额公式
7. 跨文件关联 → 验证关联字段一致性
8. 输出报告 → 分类列示问题，含行号、示例和修复建议
```

## 常用命令参考

```bash
# 检查分号结尾
grep -c "^UPDATE\|^INSERT" file.sql

# 查找VALUES缺括号
grep -cP "VALUES\s+'" file.sql

# 查找浮点数精度问题
python3 -c "import re; print(re.findall(r'(?<!\d)(\d+\.\d{3,})(?!\d)', open('file.sql').read()))"

# 查找1900年日期
grep -c "'1900" file.sql

# 查找WHERE连写
grep -cP "\bwhere[a-z]" file.sql

# 比较INSERT列数和值数
# 提取列名，按tab分割值列表，比较数量
```

## 输出格式

所有问题按以下格式报告：

```markdown
### ❌ 问题类型（行号范围）

**错误行号**：行XX~XX

**错误示例**：
```sql
-- 错误的SQL
```

**正确写法**：
```sql
-- 正确的SQL
```

**影响说明**：该错误会导致什么后果
```
