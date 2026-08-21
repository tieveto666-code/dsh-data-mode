# dsh-data-mode

DeepSeek Harness **数据模式**：只读问数 Agent 预设。可单独开源安装，**不改 dsh 核心**，也不污染原生预设。

## 隔离保证（不会影响原生模式）

安装这个包 **不会**：

- 修改 `agent-presets.default`（新建会话默认仍是 **标准模式**）
- patch host 上的 `id: agent-presets` 行
- 在 host / profile 层注册 `run_sql` / `list_data_sources`（标准、PTC、极简、创造看不到这些工具）
- 覆盖你已经有的预设目录
- 占用 id `data`

安装 **只会**：

- 在 web profile 里挂一个 **registrar**（不注册任何模型工具；web 下额外挂数据源管理 HTTP）
- 若 `$DSH_HOME/.agent-presets/dsh-data` 不存在，则复制一份用户预设进去
- 只有新建会话并 **选「数据模式」** 时，才会挂载问数工具、DuckDB，以及输入框里的数据源按钮

预设 id 是 `dsh-data`，界面名是「数据模式」。原生 id `standard` / `code` / `minimal` / `cordis` 不会被改、删、覆盖。卸载不影响原生模式。

## 安装

优先用 **带 `lib/` 的 tarball / npm 包**，这样不必为 `prepare`（tsdown）开构建脚本。

```sh
# 本地 tarball（发布物含 lib/）
dsh plugin --profile web add ./dsh-data-mode-0.1.0.tgz

# 或 npm / github（github 源会跑 prepare 编译）
dsh plugin --profile web add github:<you>/dsh-data-mode
dsh plugin --profile web add link:/path/to/dsh-data-mode
```

查询引擎是可选依赖 `duckdb`（原生 addon）。**装上之后，SQLite / XLSX / CSV / Parquet / PostgreSQL / MySQL 都走 DuckDB**；没编出 native 绑定时，SQLite 与纯 XLSX 仍回退到 Node 内置 SQLite / 本地解析，示例问数不受影响。

**pnpm 10+ 会在安装时询问是否允许编译**；不先回答的话 `dsh plugin add` 会一直停住。请先选一种：

```sh
# 需要 CSV / Parquet / Postgres / MySQL，以及用 DuckDB 统一查所有源
pnpm config set allowBuilds.duckdb true

# 只想先装上预设、稍后再编 duckdb（SQLite / XLSX 示例仍可用）
pnpm config set allowBuilds.duckdb false
```

或在该 web profile 的 `pnpm-workspace.yaml` 里写：

```yaml
allowBuilds:
  duckdb: true
```

然后重启 `dsh web`。新建会话时选择「数据模式」。不要改四个随附预设目录。

## 问数（v1）

选「数据模式」后，**先在数据源按钮里选中一个数据库或数据文件**，问数工具才看得到它。未选中的源对 Agent 不可见，也不能 `describe` / `preview` / `run_sql`。

输入框左下角 **命令（+）** 和 **只读/读写/全权限** 之间会出现数据库图标按钮（仅数据模式）。未选用时是浅色，选中某个数据源后高亮。点击后可以：

- **自定义连接数据库**：PostgreSQL、MySQL、SQLite（密码写在 `$DSH_HOME/data-mode/secrets.yaml`，不进 catalog）
- **自定义上传数据表**：`.csv` / `.xlsx`，落到工作区 `.dsh/data-mode/uploads/`
- **数据源管理**：选用或删除已经连接 / 上传的源；内置 SQLite / XLSX 示例始终出现在列表里

数据源目录仍是 YAML，给 UI 写入、Agent 读取：

| 文件 | 作用 |
| --- | --- |
| `$DSH_HOME/data-mode/catalog.yaml` | 进程级数据源目录 |
| `<workspace>/.dsh/data-mode/catalog.yaml` | 工作区覆盖（同 id 覆盖 home） |
| `$DSH_HOME/data-mode/selections.yaml` | 当前会话选中的 sourceId |

字段约定见 [`examples/catalog.yaml`](examples/catalog.yaml)。内置 `demo-sqlite` / `demo-xlsx` 会在 catalog 为空时自动注入。工作区 CSV / XLSX 需要在弹窗里上传，不会再隐式扫描 `workspace-files`。

**没有语义层**：不维护认证指标、不编译口径、不提供 `metrics.yaml`。每次回答写清本次用的公式即可。

## 支持 / 不支持

**支持**

- 上传 CSV / XLSX / 工作区 Parquet：DuckDB 只读 SQL（每个源独立内存库，表名互不覆盖）
- PostgreSQL / MySQL：DuckDB `ATTACH`（扩展需能 INSTALL/LOAD；Postgres 勾选 SSL 会加 `sslmode=require`）
- SQLite：DuckDB 已有 sqlite 扫描扩展时 `ATTACH`；否则立即回退 Node `node:sqlite`，示例预览和问数不变
- DuckDB native 不可用时：SQLite 与纯 XLSX 回退 Node 查询
- 数据模式输入框数据源按钮（选中高亮）
- 默认 LIMIT 200，硬顶 5000；`run_sql` 前必须 `describe_schema`
- A 拒答 / B 问数 / B+ 排名占比趋势 / C 归因 SOP 与数据分析 Plan Mode
- 从官方 `@deepseek-ai/dsh` 或 custom dsh 用 plugin add 安装 tarball；卸载后原生模式不变

数据源按钮需要宿主 composer 提供 `conversation.input.datasource` 插槽（custom dsh 已加；官方 dsh 尚未合入时按钮不会出现）。

**不支持**

- 语义层（认证指标、metrics.yaml、口径编译）
- MongoDB / Oracle / SQL Server / Snowflake 等非 DuckDB 易 ATTACH 的引擎
- 图表仪表盘、行级权限、实时 OLAP、独立 ML 预测
- 改 dsh 四个随附预设；把目录做成模型可写工具

## 卸载

```sh
dsh plugin --profile web remove dsh-data-mode
```

可选：删除 `$DSH_HOME/.agent-presets/dsh-data`。删除后 roster 里不再出现该预设；原生模式不受影响。
