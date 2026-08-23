# dsh-data-mode

## 项目描述

**dsh-data-mode** 是 DeepSeek Harness（DSH）的 **数据模式插件**。安装后会多一种会话类型「数据模式」：连接 PostgreSQL / MySQL / SQLite，或上传 CSV / Excel，用自然语言做**只读问数**（看表结构、预览数据、跑查询 SQL）。也可以为每个数据源维护业务口径知识，问数时自动带上。

本插件给 **原版 DSH** 使用，不修改标准 / PTC / 极简 / 创造四种原版模式，也不会让那些模式看到问数工具。新建会话默认仍是标准模式。

适合：已经在用 DSH 网页版、希望在对话里查自己的库或表格、又不想改 DSH 源码的人。

GitHub 仓库简介（创建仓库时粘贴到 Description）：

> DSH 数据模式插件：原版 DeepSeek Harness 上增加只读问数。连接数据库或上传 CSV/Excel，用自然语言查数。不改标准/PTC/极简/创造。

## 要不要把「输入框空位」一起打包？

**不要。** 那几处改动在 DSH 核心里（`InputBar.tsx` / `slots.ts`），不是这个插件。把整个 custom dsh 推上去，别人无法用 `dsh plugin add` 安装，还会把整份 Harness 源码泄露出去。

数据源按钮怎么出现：

1. **宿主已经开了专用空位** `conversation.input.datasource`（你们的 custom dsh）：按钮在「+」和权限下拉中间。
2. **官方原版 DSH**（没有这个空位）：插件改挂到原版自带的工具栏插槽 `conversation.input.left`。按钮会在权限/Plan 附近，**功能一样**，可以选库、上传、管知识。

两种宿主都只要装这一个插件。

## 安装（给别人用）

在 **web profile** 里安装，然后重启 `dsh web`。新建会话时选「数据模式」。

GitHub（把 `<you>` 换成仓库地址）：

```sh
dsh plugin --profile web add github:<you>/dsh-data-mode
```

或下载 Releases 里的 `.tgz`（已含编译结果，不必本地跑 tsdown）：

```sh
dsh plugin --profile web add ./dsh-data-mode-0.1.0.tgz
```

本机开发：

```sh
dsh plugin --profile web add link:/path/to/dsh-data-mode
```

查询引擎是可选依赖 `duckdb`。编出 native 后，SQLite / XLSX / CSV / Parquet / PostgreSQL / MySQL 都走 DuckDB；没编出来时，SQLite 和纯 XLSX 仍可用。

pnpm 10+ 安装时若询问是否编译 `duckdb`，请先选好，否则 `dsh plugin add` 会卡住：

```sh
# 需要 CSV / Parquet / Postgres / MySQL
pnpm config set allowBuilds.duckdb true

# 只想先用 SQLite / XLSX 示例
pnpm config set allowBuilds.duckdb false
```

也可在该 web profile 的 `pnpm-workspace.yaml` 里写：

```yaml
allowBuilds:
  duckdb: true
```

## 怎么用

1. 新建会话，选 **数据模式**。
2. 点输入框工具栏上的 **数据源** 按钮，选中一个库或文件。没选中时，AI 看不见任何表。
3. 直接问数。AI 只会跑只读 SQL。

按钮里还可以：连接 PostgreSQL / MySQL / SQLite、上传 CSV / XLSX、维护该源的业务知识（问数时按关键词带回口径）。

密码写在 `$DSH_HOME/data-mode/secrets.yaml`，不进目录文件。

| 文件 | 作用 |
| --- | --- |
| `$DSH_HOME/data-mode/catalog.yaml` | 数据源目录 |
| `<workspace>/.dsh/data-mode/catalog.yaml` | 工作区覆盖（同 id 覆盖 home） |
| `$DSH_HOME/data-mode/selections.yaml` | 当前会话选中的 sourceId |
| `$DSH_HOME/data-mode/knowledge/<sourceId>.json` | 该源的业务知识 |

字段约定见 [`examples/catalog.yaml`](examples/catalog.yaml)。目录为空时会自动出现内置 `demo-sqlite` / `demo-xlsx`。

**没有语义层**：不维护官方指标表。每次回答写清本次用的公式即可。

## 隔离保证

安装 **不会**：

- 修改 `agent-presets.default`
- 改 host 上的 `id: agent-presets` 行
- 让标准 / PTC / 极简 / 创造看到 `run_sql`
- 覆盖你已经有的预设目录

安装 **只会**：

- 在 web profile 挂 registrar（并挂数据源管理 HTTP）
- 若 `$DSH_HOME/.agent-presets/dsh-data` 不存在，则复制一份用户预设
- 仅「数据模式」会话挂问数工具和数据源按钮

预设 id 是 `dsh-data`。卸载不影响原生模式。

## 卸载

```sh
dsh plugin --profile web remove dsh-data-mode
```

可选：删除 `$DSH_HOME/.agent-presets/dsh-data`。

## 维护者：打 GitHub 发布包

```sh
npm run pack:release
```

得到 `dsh-data-mode-0.1.0.tgz`（含 `lib/`）。把源码仓库推到 GitHub，把这个 tarball 挂到 Release，别人就可以按上面的命令安装。
