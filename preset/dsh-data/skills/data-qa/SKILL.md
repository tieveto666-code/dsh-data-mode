---
name: data-qa
description: >
  Use for data questions: refuse off-topic (A), basic metrics (B),
  ranking/share/trend/extrema (B+), and locking 口径 before a composite question.
---

# 数据问数 SOP

工具：`list_data_sources`、`describe_schema`、`preview_rows`、`run_sql`。
无关问题禁止调用这四个工具。

## A — 拒答（不查库）

用户不是在问数据、指标、表、报表或数据集上的分析时：

1. 不要调用上述四个工具。
2. 直接用常识或会话上下文回答。
3. 若其实是写代码 / 改仓库，建议切换到 **标准模式**。

## B — 单次问数

适用于「总和 / 计数 / 均值 / 某个过滤条件下的一个数」。

1. `list_data_sources` → 只会返回用户已选中的那一个源。若 `sources` 为空，禁止猜测任何 `sourceId`（包括 `demo-sqlite` / `demo-xlsx`），请用户先在输入框左侧的数据源按钮里选中一个数据库或数据文件。
2. `describe_schema`（需要的表）→ 未 describe 的表会被 `run_sql` 拒绝。
3. 不确定列含义时 `preview_rows`（默认 20 行）。
4. **一次** `run_sql`。只读 `SELECT` / `WITH`。不要编造表名或列名。若上下文里出现「Business knowledge recalled」段落，必须按其中的键值口径理解指标（例如拆分公式），不要另编定义。知识不能替代真实表名/列名。
5. 回答里写清：本次计算公式、时间范围、粒度、过滤条件。不要假装存在官方口径。
6. `run_sql` 可带 `metric` / `timeRange` / `grain` / `filters` / `analysisKind`，写入本会话口径。

SQL 约束：默认 `LIMIT 200`，硬顶 `5000`。趋势类大结果会被行数封顶，样本不是全集。

## B+ — 排名 / 占比 / 趋势 / 最值

同样走 B 的 inspect 路径，但 SQL 必须过这份清单：

- **排名 TopN**：有明确排序列；`ORDER BY` + `LIMIT N`；说明并列规则。
- **占比**：分子分母同一过滤与时间窗；分母为 0 时说明无法计算。
- **趋势**：按时间字段 `GROUP BY` 粒度（日/周/月）；不要把预览样本当全集；缺期要说明。
- **最值**：`min`/`max` 与对应维度一起查出；不要只报一个数字不报发生在哪。

不要用第二轮 `run_sql` 去「顺便归因」。用户没问为什么，就只回答 B+。

## 组合（本 skill 只锁口径）

问句同时包含「总数 + 排名 + 原因」时：

1. 先锁一个口径（公式、时间、过滤），本会话内保持一致。
2. 顺序：事实 → B+ → 归因。归因步骤改走 `data-attribution` skill。
3. 单轮最多 1 个事实 + 1 个 B+ + 1 个归因；更多就拆计划或降级。
