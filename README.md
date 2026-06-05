# LifeOS Microsoft To Do

一个面向 LifeOS vault 的 Obsidian Microsoft To Do 插件。它 fork 自 `Ruochen0513/obsidian-simple-ms-todo-plugin`，保留侧边栏任务管理能力，并新增 LifeOS 风格的单向同步。

## 当前定位

- Microsoft To Do 是任务状态的唯一来源。
- LifeOS 同步只做 `Microsoft To Do -> Obsidian vault`。
- Daily note 只写只读链接，不写 Tasks checkbox，避免周期笔记变成任务数据库。
- 项目 README 和 fallback inbox 写 Tasks-compatible checkbox 行，方便 Obsidian Tasks 查询。
- 不使用非官方 My Day API。今日视图是近似规则：未完成且到期不晚于今天、进行中、高优、映射列表勾选进入 Daily，或今天完成。

## 安装

### 方式一：BRAT 安装

适合多设备使用，最接近普通 Obsidian 插件安装方式。

1. 在 Obsidian 里先安装并启用 [BRAT](https://github.com/TfTHacker/obsidian42-brat)。
2. 打开 `Settings -> BRAT -> Beta Plugin List -> Add Beta plugin`。
3. 填入仓库地址：

   ```text
   https://github.com/MarioZZJ/obsidian-plugin-lifeos-ms-todo
   ```

4. 让 BRAT 拉取最新 release。
5. 到 `Settings -> Community plugins` 启用 `LifeOS Microsoft To Do`。

### 方式二：手动安装 release 文件

1. 在本仓库的 GitHub Release 页面下载三个文件：
   - `main.js`
   - `manifest.json`
   - `styles.css`
2. 在 vault 里创建插件目录：

   ```text
   <你的 vault>/.obsidian/plugins/obsidian-plugin-lifeos-ms-todo/
   ```

3. 把三个文件放入该目录。
4. 重启 Obsidian，启用 `LifeOS Microsoft To Do`。

不要把 `data.json` 提交到 git。那里会保存 Microsoft token 和本机插件设置。

## 初次使用

1. 启用插件后，打开左侧 ribbon 的 Microsoft To Do 视图。
2. 点击 `Sign in Microsoft To Do`，完成微软授权。
3. 打开插件设置，启用 `LifeOS sync`。
4. 确认 `Expected vault name`。默认是 `obsidian@lifeos-mariozzj`；当前 vault 名称不匹配时不会写入。
5. 在 `LifeOS list mappings` 里给 Microsoft To Do 列表填写项目 tag，例如：

   ```text
   #科学研究/DualBasic
   ```

6. `Project README path` 可留空。留空时按 `Project note path pattern` 自动推导。
7. 运行命令 `Sync tasks to LifeOS`，或点击设置里的 `Sync LifeOS now`。

旧命令 `Sync configured target` 仍保留。启用 LifeOS sync 时，它会走 LifeOS 同步；未启用时，它走 legacy 全量 Markdown snapshot。

## LifeOS 同步输出

### 项目 README

项目文件会写入一个受控段落：

```markdown
## Microsoft To Do

<!-- mstodo:project:start -->
- [ ] 任务标题 #mstodo #科学研究/DualBasic #mstodo/list/Research 📅 2026-06-05 ^mstodo-list-task
  - 备注: ...
  - 步骤:
    - TODO step
<!-- mstodo:project:end -->
```

只编辑受控块外面的内容。受控块会被下一次同步整体覆盖。

主任务行是 Tasks-compatible checkbox。To Do 的步骤不会写成 checkbox，故不会被 Obsidian Tasks 当成独立任务。

### Daily note

Daily note 的 `Daily task heading` 下会写入只读链接块：

```markdown
### 任务
<!-- mstodo:today:start -->
- [[1. 项目/科学研究-DualBasic/DualBasic.README#^mstodo-list-task|任务标题]] · #科学研究/DualBasic · #mstodo/list/Research · due 2026-06-05
<!-- mstodo:today:end -->
```

这里故意不写 `- [ ]`。周期笔记只做今日视图，不抢 Microsoft To Do 的状态权。

### Fallback inbox

未映射列表、或项目 README 不存在且未开启自动创建时，任务会进入 `Unmapped inbox path`。默认复用：

```text
Microsoft To Do.md
```

这避免根目录同时出现 `Microsoft To Do.md` 和 `Microsoft To Do Inbox.md` 两个文件。

## 模板和路径配置

所有路径都是 vault 内相对路径，不要写 Windows 绝对路径。这样同一套配置可以在 Windows、macOS 和移动端之间迁移。

### 周期笔记 Daily

设置项：

- `Daily note path pattern`
- `Daily template path`
- `Daily task heading`

`Daily note path pattern` 支持：

```text
{{YYYY}}
{{MM}}
{{DD}}
{{YYYY-MM-DD}}
```

默认值：

```text
0. 周期笔记/{{YYYY}}/Daily/{{MM}}/{{YYYY-MM-DD}}.md
```

推荐 Daily 模板至少包含同步落点：

```markdown
# {{date}}

### 任务

### 记录
```

如果当天 Daily note 不存在，插件会读取 `Daily template path` 创建。模板不存在时使用内置最小模板。

### 项目 README

设置项：

- `Project note path pattern`
- `Project template path`
- `Create missing project notes`
- `Project sync heading`
- `Insert project sync before heading`

`Project note path pattern` 用于列表映射只填 project tag、未填 override path 的情况。默认：

```text
1. 项目/{{AREA}}-{{PROJECT}}/{{PROJECT}}.README.md
```

例子：

```text
#科学研究/DualBasic
```

会推导为：

```text
1. 项目/科学研究-DualBasic/DualBasic.README.md
```

项目模板支持这些占位符：

```text
{{AREA}}
{{PROJECT_AREA}}
{{PROJECT}}
{{PROJECT_TAG}}
{{PROJECT_TAG_PATH}}
{{LIST_NAME}}
{{PROJECT_NOTE_PATH}}
{{YYYY}}
{{MM}}
{{DD}}
{{YYYY-MM-DD}}
```

推荐项目模板：

```markdown
# {{PROJECT}}

tags:
  - {{PROJECT_TAG_PATH}}

## LifeOS

## 资料

## 日志
```

默认情况下，项目 README 不存在时不会自动创建，任务会进入 fallback inbox。确认你的项目路径模式没问题后，再打开 `Create missing project notes`。

## 多设备使用

推荐做法：

- 插件本体通过 BRAT 从本仓库 release 安装。
- 模板文件放在 vault 内，跟随你的 Obsidian 同步方案。
- vault 路径不要写入设置；设置只写 vault 内相对路径。
- 每台设备首次使用时检查登录状态。Microsoft token 存在插件 `data.json` 里，跨设备同步后如果授权失效，重新登录即可。

## 开发和发布

本仓库直接发布 release，不提交 Obsidian 官方 Community Plugin 市场。

本地验证：

```powershell
npm install
npm test
npm run lint
npm run build
```

发布 release 时上传这三个文件：

```text
main.js
manifest.json
styles.css
```

BRAT 和手动安装都依赖这三个 release asset。

## OAuth 和隐私

当前 OAuth scope：

```text
Tasks.ReadWrite
User.Read
offline_access
```

插件不做隐藏遥测，不上传 vault 内容。同步时只访问 Microsoft Graph To Do API，并只写配置指定的 vault 文件。

## License

[MIT](LICENSE)
