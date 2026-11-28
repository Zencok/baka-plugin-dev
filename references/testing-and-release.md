# 测试、调试、导入与发布

使用四层验证：源码/契约、离线行为、真实 QuickJS、已安装客户端与实际服务。它们解决的问题不同，发布说明记录本次真正跑过的层次，不沿用上游旧测试计数作为证据。

## 1. 快速结构检查

在本仓库执行：

```powershell
node --check ./my-provider.js
node scripts/check.cjs ./my-provider.js
```

检查器会执行插件顶层源码以读取清单，只对已经审阅的可信代码使用。带文件参数只检查文件标记、同步导出、清单和声明的 handler，不访问未知服务。它不证明所有 handler 的返回值正确。

测试本仓库提供的模板、契约工具和文档：

```powershell
npm test
npm run check:docs
```

默认不需要网络或 npm 依赖。未配置原生探针时，原生用例会明确跳过；独立执行 `test:native` 必须先配置探针，缺失时会失败。Node VM 是作者检查环境，不能证明生产隔离、内存限制或取消行为。

对你将交付的最终文件，还可运行 `node scripts/check.cjs --native ./my-provider.js`。必须配置实际 `BAKA_V2_PROBE`，否则命令失败；它在结构检查后加载同一源文件，只确认真实 lean QuickJS 的导入契约，不调用 handler、不证明服务可用。不要把为诊断改写的副本当作原文件通过。

## 2. 为你的服务增加离线行为测试

使用脱敏的真实响应 fixture 和可注入的 `sdk`。直接调用插件中的 handler，断言结果和发出的请求，不依赖内部实现的字符串排列。仓库工具提供的 `createSDK` 只针对合成模板，不是任意服务模拟器。

优先覆盖：

| 场景 | 应观察的结果 |
|---|---|
| 搜索首/续/末页，limit=1 和 limit=100 | 无跳项、重复、超限；终页显式 null |
| 数值 `7` 与字符串 `"7"` | 保留两种不同身份 |
| 游标循环、空页仍有游标、total 不符 | 报错，不发布不完整快照 |
| HTTP 401/403/429/5xx 和损坏 JSON | 可区分鉴权、权限、限流、故障；不假装空结果 |
| 账号切换、源快照更新 | 旧游标与缓存失效 |
| 音质不存在与网络错误 | 只有真实音质缺失允许 `quality_unavailable` |
| resolver 准备上下文和绑定 | 保留原 provider 归属，错误不隐式切源 |
| 富歌词、加密包、过期签名 | 还原正确文本/结果，保留失败语义 |

对 `links.resolve` 返回的集合继续调用 `collections.members`，证明解析结果确实可遍历。对特殊媒体验证真实 envelope，不接受假 key 或只有格式正确的假 URL。

## 3. 编译真实 V2 探针

在安装 Rust 工具链、能构建 BakaMusicFlutter 宿主的机器上执行。checkout 路径可以换成你的实际位置：

```powershell
cargo build --manifest-path D:/Github/Music/BakaMusicFlutter/rust/Cargo.toml -p baka-plugin-host --example v2_probe
```

Windows 默认输出为 `rust/target/debug/examples/v2_probe.exe`；其他平台没有 `.exe` 后缀。自定义 `CARGO_TARGET_DIR` 时使用实际产物路径。探针必须来自你准备支持的宿主版本，而不是随便找的旧二进制。

然后回到本仓库运行独立的原生用例：

```powershell
$env:BAKA_V2_PROBE = 'D:/Github/Music/BakaMusicFlutter/rust/target/debug/examples/v2_probe.exe'
npm run test:native
```

这些用例启动本地 HTTP fixture，由真实 QuickJS 加载源码并检查结果，不调用成品插件的外部音乐服务。

## 4. 对单个插件调用能力

探针参数是文件路径，CLI 形式为：

```text
v2_probe SOURCE [CAPABILITY REQUEST_JSON_FILE]
```

创建无敏感信息的请求文件，并执行：

```powershell
New-Item -ItemType Directory -Force artifacts | Out-Null
[IO.File]::WriteAllText((Join-Path $PWD 'artifacts/search.json'), '{"query":"example","kind":"music","cursor":null,"limit":1}', [Text.UTF8Encoding]::new($false))
& $env:BAKA_V2_PROBE ./my-provider.js search ./artifacts/search.json
```

探针会先检查/加载源码，再执行能力；调用可能访问插件自己配置的真实服务。只有你明确要测试该服务并具备所需配置时才这样运行。示例里的 `.invalid` 服务当然不会返回真实内容。

可以使用环境变量传递文件路径：

| 变量 | 用途 |
|---|---|
| `BAKA_PROVIDER_SETTINGS_FILE` | 含配置对象的 JSON 文件，映射到加载时的 settings |
| `BAKA_PROVIDER_STORAGE` | 探针的独立存储目录；为不同测试设置隔离目录 |
| `BAKA_PROVIDER_RESULT_FILE` | 可选的完整结果 JSON 文件，便于断言真实返回 |

默认 stdout 只提供清单和结果摘要，如 `providerId/version/capabilities/lean/items/hasNext/hasUrl/hasLyrics`，它不是完整业务响应。实际配置或媒体结果可能含临时凭据，不把这些文件加入仓库。

宿主自身的回归入口可按改动范围选择，例如：

```powershell
cargo test --manifest-path D:/Github/Music/BakaMusicFlutter/rust/Cargo.toml -p baka-plugin-host --test v2_contract --test v2_pilot_sdk
```

这验证的是宿主，不会自动测试你刚写的提供方协议。

## 5. 常见故障定位

| 表现 | 检查位置 |
|---|---|
| 不识别 V2 文件 | 精确首行、无 BOM、无空白前缀；不要导出 ZIP/网页/字节码 |
| 清单失败 | `kind/id/author/sourceId` 或 resolver `sources`、SemVer、能力名与分组 |
| `require/Buffer/axios/fetch` 不存在 | 打包产物残留 Node/npm 或浏览器依赖；换通用 SDK |
| 能导入但调用失败 | handlers 是否嵌套、能力是否声明、请求是否一个对象 |
| JSON 解析失败 | 接口是否返回 HTML、验证码、登录页；按真实 responseType 处理 |
| 列表重复或导入卡住 | cursor 进度、limit、账号/快照约束、total 与终页 |
| HTTP 200 但无法播放 | 业务错误、地址过期、必需 headers、实际格式/质量与原生描述 |
| 账号更新后仍使用旧值 | settings 是快照；动态状态从 storage/service 按次读取 |
| 读取不存在的存储值有差异 | 对 `sdk.storage.get` 使用 `?? null` 归一化，见 SDK |
| 登录 callback 能返回但媒体失败 | 账号回调与 `media.license` 不是同一协议 |

日志记录能力、请求阶段、状态码和脱敏的实体 ID；避免打印 token、Cookie、完整签名 URL、原始授权结果或媒体 key。

## 6. 在支持 V2 的客户端验证

使用应用现有插件管理入口导入最终 `.js` 或 HTTPS 地址。检查作者、版本、能力和配置显示，分别验证启用、禁用、重启恢复、同 ID 更新及失败后保留旧包。

最小体验检查：搜索 → 打开结果/集合 → 播放 → 切歌 → 查看歌词 → 返回列表。增加的每条功能继续验证相应路径，例如标签/榜单翻页、歌单完整导入、登录切换、显式 resolver 选择、MV 或下载。

Qt、Electron、Flutter 是不同宿主边界；本教程核对的是当前 Flutter/Rust V2 契约。不要从应用名称或“CommonJS”这一共同点推断所有旧客户端均兼容。真机播放还取决于媒体、系统和设备，需记录实际客户端版本、平台、执行步骤和结果。

## 7. 隔离的 Flutter 应用导入回归

本仓库还提供 `npm run test:import`。它依赖已准备的 Flutter SDK、应用依赖和当前构建的原生 FFI 库，不自动安装 SDK、不修改应用实现，不访问用户已安装客户端的插件库。

```powershell
$env:BAKA_FLUTTER_APP = 'D:/Github/Music/BakaMusicFlutter'
$env:BAKA_FLUTTER_SDK = 'D:/flutter'
npm run test:import
```

脚本在目标应用 `.dart_tool` 下临时放置测试，使用临时配置/存储和 loopback 订阅，结束后清理。回归验证直链模板经 URL/相对订阅导入、配置写入与重载后保留、搜索、媒体地址返回、默认 `master` 播放源准备、默认 `128k` 直接取流、同 ID 更新，以及拒绝平铺 handler。HTTP fixture 提供有效的合成 PCM WAV，测试不代表设备音频解码。未配置环境或缺少依赖/原生库会失败，不能写成“已通过”。`npm test` 默认离线运行，不隐式触发此步骤。

这些是**仓库模板**的回归；不会自动验证任意新生成的插件或真实服务。交付新源时复用测试方法，为它准备真实字段的脱敏 fixture，并另外记录实际客户端/设备播放结果。

## 8. 独立发布与更新

1. 保持 `manifest.id`，只在协议不兼容时考虑新的 `sourceId`，不要随版本改实体归属。
2. 增加 `version`。本项目成品仓库采用十进位进位约定：`1.0.9` 后为 `1.1.0`；保持构建元数据与实际源版本一致。
3. 用最终构建文件重跑语法、结构、业务 fixture 和真实宿主验证，避免测试源文件而分发另一个产物。
4. 发布单个 UTF-8、无 BOM 的 V2 `.js`，保留原作者、许可证、帮助文本、质量声明与配置字段。
5. 使用 HTTPS 分发。若客户端入口支持摘要校验，摘要须基于最终字节计算；清单字段和订阅格式属于具体安装器，先核对目标客户端，不能沿用旧 Electron 清单当作 V2 通用标准。
6. 记录本次改变、配置变化、实际验证范围和未解决的问题。不要把“成功加载”写成“所有平台可播放”。

`baka-plugins/plugins/v2` 中的生成流程和成品是正式参考，见[源码路线](production-examples.md)。本仓库的合成模板不应直接作为真实音乐服务发布。发布、上传或安装到现有用户环境按用户明确要求执行。
