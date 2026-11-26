# 年度考核测评系统（网页版 · GitHub Pages + 云数据库）

纯前端实现：HTML + 原生 JavaScript + SheetJS。
数据支持两种模式：**本地单机**（localStorage，零配置）与**云端共享**（Supabase / PostgreSQL，多人实时汇总）。
前端托管在 GitHub Pages，无需自建服务器。

## 功能

- 考核对象维护：姓名 + 职务，支持单个增删改、Excel 批量导入
- 考核内容维护：默认五项（政治品德、工作能力、工作态度、业绩贡献、廉洁从业，各 20 分），可增删改、恢复默认
- 打分测评：每项不超过 20 分，总分不超过 100 分，备注 200 字以内，超限实时提示并拦截提交
- 得分汇总：按考核对象统计各项平均分与总分平均分并排名
- Excel 导入：先预览校验（姓名/职务必填、长度、字符、表内去重、与系统去重），确认后入库；可下载 xlsx 模板
- Excel 导出：包含「得分汇总」「打分明细」两个工作表

## 开启云数据库（多人共享评分）

默认不配置任何云端参数时是单机模式，双击 `index.html` 即可用。要让多人评分实时汇总到一处，按下面 4 步：

1. 注册 [supabase.com](https://supabase.com) → New Project（免费档 500MB，足够几千条打分记录）。
2. 进入项目 → **SQL Editor** → 新建查询 → 粘贴本目录 `supabase.sql` 全部内容 → Run（建表 + 权限策略，只需一次）。
3. 项目 → **Project Settings → API**，复制 `Project URL` 和 `anon / publishable key`。
4. 打开 `js/cloud.js`，把这两个值填到第 12–13 行的 `SUPABASE_URL` / `SUPABASE_ANON_KEY`，提交到 GitHub 即可。

> 只填 **anon / publishable key**，`service_role` 密钥绝不能写进前端。权限由数据库 RLS 策略控制。
> 首次启用云端时，浏览器里已录入的数据会自动搬运上云（仅当云端为空时）。
> 页面右上角会显示当前同步状态：绿色「云端共享」/ 黄色「离线」/ 灰色「单机模式」。

## 使用方式

### 本地直接打开
双击 `index.html`（推荐 Chrome / Edge）。

### 部署到 GitHub Pages
1. 新建一个公开仓库（例如 `kaopin`）。
2. 把本目录全部文件上传到仓库根目录（必须包含 `.nojekyll`，否则 Pages 可能忽略部分文件）。
3. 仓库 Settings → Pages → Source 选择 `Deploy from a branch`，分支选 `main`，目录选 `/root`，保存。
4. 等待约 1 分钟，访问 `https://<你的用户名>.github.io/<仓库名>/` 即可。

> 路径说明：存储键按页面路径区分，根路径部署（`username.github.io`）与子路径部署（`username.github.io/repo`）数据互不干扰。

## 账号

| 角色 | 进入方式 |
|------|---------|
| 打分人员 | 输入姓名即可，只能打分与查看汇总 |
| 管理员 | 点击「管理员」入口，默认密码 `admin888`，登录后可在「管理后台 → 系统设置」修改 |

**上线后请立即修改默认管理员密码。**

## 数据存储说明

数据保存在各自浏览器本地（localStorage），不同电脑 / 手机之间不互通，也不上传任何服务器。
多人协作时有两种做法：

1. 单机集中录入：一台电脑完成全部打分，定期导出 Excel 备份。
2. 多人共享：需要接入后端或云数据库（小程序版已用微信云开发实现共享）。

清理浏览器缓存、更换设备、切换浏览器都会导致看不到原有数据，请务必定期导出 Excel。

## 目录结构

```
kaopin-web/
├── index.html            # 页面骨架
├── .nojekyll             # 让 GitHub Pages 原样托管静态文件
├── css/style.css
├── js/
│   ├── xlsx.full.min.js  # SheetJS（本地内嵌，离线可用）
│   ├── store.js          # 数据存储、初始化、CSV 兜底
│   ├── importer.js       # Excel 解析 + 校验 + 预览
│   ├── exporter.js       # 得分汇总 / 打分明细导出
│   └── app.js            # 页面逻辑
└── README.md
```
