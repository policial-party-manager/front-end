# Issue tracker: GitHub

本仓库的需求、问题和规格记录在 GitHub Issues：
https://github.com/policial-party-manager/front-end/issues

使用 GitHub CLI `gh` 操作，执行前核对目标仓库为
`policial-party-manager/front-end`。

## 常用操作

- 核对仓库：`gh repo view --json nameWithOwner`
- 读取任务：`gh issue view <number> --json number,title,body,labels,comments`
- 列出任务：`gh issue list --state open`
- 创建任务：`gh issue create --title "..." --body-file <正文文件>`
- 添加评论：`gh issue comment <number> --body-file <正文文件>`
- 添加或移除标签：`gh issue edit <number> --add-label "..." --remove-label "..."`

多行正文先写入临时 Markdown 文件，再通过 `--body-file` 提交。
发布前核对已有任务和评论，避免重复；发布后回读确认。

## 任务关联

父子任务优先使用 GitHub 原生 sub-issues；不可用时，在子任务正文中写
`Part of #<父任务编号>`，并在父任务中维护任务清单。

阻塞关系优先使用 GitHub 原生 issue dependencies；不可用时，在被阻塞
任务正文顶部写 `Blocked by: #<编号>`。开始前核对所有阻塞项均已关闭。

## 技能操作约定

技能要求“发布到 issue tracker”时，表示创建 GitHub Issue；
要求“获取相关 ticket”时，表示读取对应 Issue 及评论。
操作仍须符合当前任务授权。

推送、发布、合并或关闭 Issue 前，核对是否已有明确授权；
已有授权时继续执行，否则先请求确认。关闭 Issue 前先发布结论评论。

## Pull requests

**PRs as a request surface: no.**
