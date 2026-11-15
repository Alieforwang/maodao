# 码到

常驻系统托盘的邮箱验证码提醒。它听 QQ 邮箱、网易 163/126、Gmail 和 Outlook 的新邮件，认出验证码后在屏幕右下角弹出。只有点通知或「复制」才会把验证码放进剪贴板，不会自动复制。

通知用的是无边框、置顶的小窗口，而不是系统原生 Toast。Electron 在 Windows 上的系统通知不能稳定做出设计稿里的大号验证码和「复制」按钮，所以用这个小窗实现同样的位置和样式。

## 安装

发布包是 Windows x64 的 NSIS 安装程序：`MaoDao-Setup-1.0.7-x64.exe`。

1.0.1 及更早的安装包没有自动更新。需要先手动安装一次 1.0.2 或更新版本，之后才会从 GitHub Releases 检查新版本。

1. 双击安装包，可以选择安装目录。
2. 打开「码到」。它会留在系统托盘。
3. 关掉主窗口不会退出，要从托盘面板里点「退出」。
4. 需要开机就运行时，在设置里打开「开机自动启动」。

开发机运行：

```bash
npm install
npm run dev
```

打包 Windows 安装包（可在 Linux 上交叉编译）：

```bash
npm run dist:win
```

安装包会出现在 `release/`。

## 添加邮箱

添加账号时选类型，服务器和端口会自动填上。授权码只通过系统加密保存：Windows 用 DPAPI（Electron `safeStorage`）。加密不可用时，码到拒绝把授权码明文写进磁盘，只留在本次运行的内存里。

日志里不会出现授权码、密码或 OAuth 令牌。

### QQ 邮箱

1. 网页打开 [QQ 邮箱 IMAP 说明](https://service.mail.qq.com/detail/0/75)，进入设置 → 账号。
2. 开启 IMAP/SMTP。系统会要求用密保手机发短信。
3. 生成授权码，填到码到。不要填 QQ 密码。
4. 服务器是 `imap.qq.com`，端口 `993`。

### 网易 163 / 126

1. 按 [网易邮箱 IMAP 说明](https://help.mail.163.com/faqDetail.do?code=d7a5dc8471cd0c0e8b4b8f4f8e49998b374173cfe9171312b77aeea3d2c8a8) 打开设置 → POP3/SMTP/IMAP。
2. 开启 IMAP，新增客户端授权码。不要填邮箱密码。
3. 163 的服务器是 `imap.163.com`。126 把服务器改成 `imap.126.com`。yeah.net 是 `imap.yeah.net`。端口都是 `993`。
4. 网易不发 IMAP `ID` 命令会报 `Unsafe Login`。码到对这三家服务器会在登录前发送 `ID`（imapflow 的 `clientInfo`，并在服务器没宣告 `ID` 能力时仍然发送）。

### Gmail

1. Google 账号先开启两步验证。
2. 按 [应用专用密码说明](https://support.google.com/accounts/answer/185833?hl=zh-Hans) 生成 16 位密码。码到会自动去掉其中的空格。
3. 在 Gmail 设置里确认 IMAP 已开启。不要填 Google 账号密码。
4. 服务器 `imap.gmail.com`，端口 `993`。

### Outlook / Hotmail / Live

个人版 Outlook 不能用密码登录 IMAP。添加账号时选 Outlook / Hotmail / Live，点「登录 Microsoft 账号」。码到打开微软官方登录页，登录成功后自己连接 `outlook.office365.com:993`。不用先填邮箱，也看不到 IMAP 和 Azure 选项。

登录窗口打不开时，用「改用设备码登录」。页面上有一个代码，点「复制代码并打开 microsoft.com/link」，在微软页面粘贴。登录完成后会自动继续连接邮箱。

用 QQ 注册的微软账号，如果登录结果里能认出 `outlook.com` / `hotmail.com` 地址，列表标题用那个收信地址，下面再写「微软账号：」和 QQ 登录名。备注名可以改显示，收信地址仍然看得见。同一个收信地址不会添加两次。

已经在 1.0.5 里添加过的 Outlook 账号不用重登。编辑账号里可以核对收信地址，不改也能继续收信。令牌过期时，这一行会显示「需要重新登录」。

客户端 ID 和回调地址在「高级选项」里，一般不需要填写。留空时用内置客户端，回调是 `https://localhost`。自己的 Azure 应用才填写客户端 ID，这时回调是 `http://127.0.0.1:45832/callback`，要和 Azure 里登记的一致。注册步骤见 [微软文档](https://learn.microsoft.com/zh-cn/entra/identity-platform/quickstart-register-app)。权限仍是 `IMAP.AccessAsUser.All`、`openid`、`email`、`offline_access`，不要创建客户端密码。

## 验证码和通知

- 只处理最近 3、5 或 10 分钟内的新邮件。启动时不翻更早的历史邮件，避免刷屏。
- 认不出验证码的邮件默认不弹。设置里可以改成所有新邮件都提醒。
- 主题和正文分开打分。优惠码、邀请码、订单号和 Reference 不会当成验证码。分组码如 `123-456` 按原样显示，复制时去掉分隔符。
- 把握高时直接弹出验证码。拿不准时弹出「可能是验证码」，可以点候选。链接验证邮件弹出「打开链接」，不会自动打开。
- 「不是验证码」和「选另一个」按发件域名记在设置里，可以删除。删掉账号或重新登录都不会清掉。通知上可以导出一份脱敏样本。
- 设置里的 AI 识别默认关闭。打开后，只有规则把握不够时才把去掉邮箱和手机号的正文发给兼容 OpenAI 的接口。密钥用系统加密保存。本地 Ollama 不联网。
- 「全部邮件」把最近拉到的信留在本机，可以按邮箱和分类筛选，改成验证码、链接验证或非验证码。这些改动记在发件域名上。可以清空，也可以限制保留天数和每个邮箱的封数。
- 右下角通知显示验证码、服务名、标题和收件邮箱。点通知或「复制验证码」才复制。
- 托盘面板和主窗口「记录」保留最近 20 条，可以单条复制，也可以清空。
- 服务器支持时用 IMAP IDLE。不支持时大约每 25 秒轮询。断线会退避重连；授权码错误会停在「登录失败」，不会不停重试。

## 测试

```bash
npm test
npm run e2e
```

`npm test` 含识别规则单元测试，以及用 GreenMail 做的 IMAP IDLE 集成测试。`npm run e2e` 在本机 GreenMail 上跑完整链路：投递邮件 → IDLE 收到 → 识别验证码 → 弹出通知 → 此时剪贴板不变 → 点击「复制验证码」后剪贴板才是该验证码。

GreenMail 需要本机有 Java。jar 不在仓库里时，测试脚本使用 `tools/greenmail-standalone.jar`（可从 Maven Central 的 `com.icegreen:greenmail-standalone:2.1.3` 下载）。

## 未在真实邮箱上验证的部分

这台环境没有 QQ、网易、Gmail、Outlook 的真实授权，所以下面几项没有连上官方服务器：

- QQ 授权码登录
- 网易 163/126 的真实 `Unsafe Login` 拦截（ID 命令的发送逻辑有单元测试，完整登录没有对网易服务器验证）
- Gmail 应用专用密码
- Outlook 设备码和浏览器 PKCE 的真实微软登录
- Windows 开机自启和 DPAPI 只在代码里走 Electron 的系统 API。这台 Linux 没有可用的密钥环，`safeStorage` 报告不可用，因此端到端测试的授权码只留在内存，并确认没有明文写盘
