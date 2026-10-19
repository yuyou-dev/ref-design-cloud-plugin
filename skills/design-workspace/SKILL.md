---
name: ref-design-cloud-workspace
description: 在 Codex 对话中通过 Ref Design 云端连接器进行工程管理、参考图上传、参数引导和魔搭珠宝图像创作。
---

先核验连接器状态；无授权时通过连接器启动登录，用户自行在浏览器完成魔搭及 Ref Design 账号授权。不要读取凭据或索要聊天中的密码、Token。

获取真实服务端工具列表和设计参数，以返回 schema 为准。首次打开工程首页，由用户创建或选择工程；不要自动创建样例。工作台使用 `view=codex` 展示中间画布与右侧生成结果。通过对话逐步引导主石、款式、金属、参考图、标准/Turbo 模型及设计需求。素材、草稿、参数、历史必须绑定选定工程。

只上传当前用户明确提供的附件。优先使用安装包 CLI `upload 工程ID 本轮附件路径`，它通过 MCP 的 begin_attachment_upload、append_attachment_chunk、complete_attachment_upload 分块传输；本机路径仅由本地 CLI 读取，不传给云端。魔搭 ms.show 的 capability URL 可能被平台网关拦截，不把直接 HTTP 上传作为默认路径。上传完成后核对返回 SHA256 与本地文件一致，并重新读取工程，确认 reference 已指向新素材；未核验不得提交生成。生成前确认工程、素材和参数快照。只调用魔搭云端设计接口；跟踪任务到成功后展示结果。失败或限流如实说明并退避，不擅自重复提交。

不能因已安装就称为已连接，不能因已提交就称为已生成。公开薄客户端没有后台算法或运营者平台凭据。登录失败时不得切换管理员密钥或其他生图服务。

当前聊天未热加载 MCP 时，使用安装器返回的 node 与 cli 绝对路径执行等效命令。macOS/Linux 示例（将 NODE/CLI 替换为真实路径，参数文件放临时目录）：

```sh
"NODE" "CLI" connect
"NODE" "CLI" status
"NODE" "CLI" tools
"NODE" "CLI" call get_project /absolute/path/project-args.json
"NODE" "CLI" upload PROJECT_ID /absolute/path/user-attachment.png
```

`project-args.json` 示例：`{"projectId":"用户选择的真实工程ID"}`。call 的最后一项是 UTF-8 JSON 文件路径，不能直接传 JSON 字符串。其他工具名称及参数须以 tools 当前返回 schema 为准；JSON 文件不得含密码或令牌。PowerShell 同样参数，但可执行路径前使用 `&`。保持 connect 进程直到用户完成浏览器登录配对。
