[English](#simple-microsoft-to-do-for-obsidian) | [简体中文](#simple-microsoft-to-do-for-obsidian-中文说明)

# Simple Microsoft To Do for Obsidian

An unofficial plugin for [Obsidian](https://obsidian.md) that allows you to integrate and manage your **Microsoft To Do** tasks directly within the Obsidian sidebar.

## ✨ Features

- **Sidebar Integration**: View your to-dos in the Obsidian sidebar without switching windows.
- **Task Management**:
    - ✅ **View Tasks**: Select and view tasks from any Microsoft To Do list, not only the default list.
    - ➕ **Add Tasks**: Quickly create new tasks in the selected list via the input box at the bottom.
    - ☑️ **Complete Tasks**: Click the checkbox to mark tasks as completed (syncs to Microsoft To Do).
    - 📝 **Markdown Sync**: Write all lists, tasks, notes, and checklist steps into an Obsidian note.
- **Secure Login**: Uses the official Microsoft OAuth2 authorization flow and supports automatic Access Token refreshing, so you don't need to log in frequently.

## 🛠️ Installation

### Manual Installation (From Release)

1. Download the latest `main.js`, `manifest.json`, and `styles.css` files from the GitHub Releases page.
2. Go to your Obsidian vault directory: `.obsidian/plugins/obsidian-microsoft-todo/` (create the folder if it doesn't exist).
3. Place the downloaded files into this folder.
4. Restart Obsidian and enable "Simple Microsoft To Do" in **Settings** -> **Community Plugins**.

## 📖 Usage Guide

1. After **enabling the plugin**, a ☑️ icon will appear in the Obsidian Ribbon (left sidebar).
2. Click the icon to open the **Microsoft To Do** view in the right sidebar.
3. For the first use, you will see a **"Sign in Microsoft To Do"** button.
4. Click to sign in. A browser window will open for Microsoft authorization. Please sign in and authorize.
5. After successful authorization, the browser will attempt to redirect back to Obsidian. The plugin will automatically fetch the Token and load your task list.

### Common Operations

- **Select List**: Choose a Microsoft To Do list from the dropdown at the top of the sidebar.
- **Refresh List**: Click the "Refresh" button.
- **Add Task**: Type in the input box at the bottom of the selected list and press `Enter`.
- **Sync to Note**: Click "Sync to note" or run the command **Sync Microsoft To Do to markdown**. The default target file is `Microsoft To Do.md` and can be changed in settings.
- **Sign Out**: Click "Sign out" at the top of the view, or sign out via the plugin settings page.

## 📄 License

[MIT License](LICENSE)

---

<div id="simple-microsoft-to-do-for-obsidian-中文说明"></div>

# Simple Microsoft To Do for Obsidian (中文说明)

这是一个为 [Obsidian](https://obsidian.md) 开发的非官方插件，允许您直接在 Obsidian 的侧边栏中集成和管理您的 **Microsoft To Do** 任务。

## ✨ 功能特性

- **侧边栏集成**：在 Obsidian 侧边栏中查看您的待办事项，无需切换窗口。
- **任务管理**：
    - ✅ **查看任务**：可以选择并查看任意 Microsoft To Do 清单，不再只读取默认清单。
    - ➕ **添加任务**：通过底部输入框把任务创建到当前选中的清单。
    - ☑️ **完成任务**：点击复选框即可标记任务完成（同步至 Microsoft To Do）。
    - 📝 **同步到文档**：将全部清单、任务、详细备注和检查步骤写入 Obsidian 笔记。
- **安全登录**：使用微软官方 OAuth2 授权流程，支持自动刷新 Access Token，无需频繁登录。

## 🛠️ 安装方法

### 手动安装 (从 Release)

1. 从 GitHub Releases 页面下载最新的 `main.js`, `manifest.json`, 和 `styles.css` 文件。
2. 进入您的 Obsidian 仓库目录：`.obsidian/plugins/obsidian-microsoft-todo/`
3. 将下载的文件放入该文件夹中。
4. 重启 Obsidian，在 **设置** -> **第三方插件** 中启用 "Simple Microsoft To Do"。

## 📖 使用指南

1. **启用插件**后，Obsidian 界面左侧 Ribbon 栏（侧边条）会出现一个 ☑️  图标。
2. 点击图标，右侧侧边栏将打开 **Microsoft To Do** 视图。
3. 初次使用时，视图中会出现 **"Sign in Microsoft To Do"** 按钮。
4. 点击登录，浏览器将弹出微软授权页面，请登录您的微软账号并授权。
5. 授权成功后，浏览器会尝试唤起 Obsidian，插件将自动获取 Token 并加载您的任务列表。

### 常用操作

- **选择清单**：在侧边栏顶部的下拉框选择 Microsoft To Do 清单。
- **刷新列表**：点击 "Refresh" 按钮。
- **添加任务**：在当前清单底部的输入框输入内容，按下 `Enter` 键即可。
- **同步到文档**：点击 "Sync to note"，或执行命令 **Sync Microsoft To Do to markdown**。默认写入 `Microsoft To Do.md`，可在设置页修改路径。
- **注销账号**：在视图顶部点击 "Sign out"，或在插件设置页点击注销。

## 📄 许可证

[MIT License](LICENSE)