# V2 原生 SDK 参考

V2 插件通过处理器第二个参数 `sdk` 使用宿主服务。本页描述当前 Flutter/Rust QuickJS 实现；导出、身份与分页规则见 [契约](./contract.md)，请求和业务结果见 [能力参考](./capabilities.md)，验证命令见 [测试与发布](./testing-and-release.md)。

```js
// 这是 handlers 内的方法片段，不是完整可安装插件。
async function search(request, sdk) {
  const url = new URL("/search", "https://example.invalid");
  url.searchParams.set("q", request.query);
  // 在这里调用 sdk.http.request，并把服务响应映射成 V2 Page。
}
```

插件文件仍需精确首行 `// @baka-provider 2` 和同步 `module.exports = { manifest, handlers }`。没有 `baka.register()`，也没有可供插件调用任意原生方法的通用桥。

## 运行环境与公共入口

`sdk` 包含且仅包含以下命名空间：

| 入口 | 用途 | 调用形式 |
| --- | --- | --- |
| `sdk.http` | 原生 HTTP 请求 | 异步 |
| `sdk.bytes` | 字节编码、文本解码、zlib | 同步 |
| `sdk.text` | HTML 实体解码 | 同步 |
| `sdk.crypto` | 哈希、HMAC、随机字节、AES | 同步 |
| `sdk.storage` | 插件隔离的持久化字符串 | 异步 |
| `sdk.settings` | 加载时的用户配置快照 | 属性读取 |
| `sdk.log` | 宿主诊断日志 | 同步 |

`sdk` 和各命名空间对象使用 `Object.freeze`。`settings` 是环境对象展开后的浅层冻结副本，不能把嵌套值理解为深度不可变对象。处理器可以直接返回 JSON 兼容结果，也可以返回 Promise；所有需要完成的 HTTP 和存储操作都应在返回前 `await`。

运行时提供标准 JavaScript 内建对象，以及 `console`、`URL`、`URLSearchParams`、`setTimeout`、`clearTimeout`、`AbortController`、`AbortSignal`。它不是 Node 或浏览器：没有安装 `require`、npm 模块加载器、`Buffer`、`axios`、`process`、`lx`、`window`、`document`、`fetch`、`TextEncoder`、`TextDecoder`、`setInterval`。CommonJS 导出容器不意味着支持 Node CommonJS 依赖加载。开发期可以使用工具或打包器，交付文件必须包含所需的小型纯 JS 辅助函数，且不留下运行时 import/require。

不要依赖以 `__baka` 开头的内部对象，也不要把源码中的内部 native 方法写成公共 SDK。当前没有 `sdk.config`、`sdk.errors`、`sdk.lyrics`、RSA/DES、平台专属 ekey 或歌词包解密 API。来源端点、签名规则、密钥封装、歌词包头及业务转换由插件组合通用原语实现。

## HTTP

```ts
sdk.http.request(options: {
  url: string;
  method?: string;                  // 默认 "GET"
  headers?: Record<string, string>; // 默认 {}
  body?: string;
  bodyHex?: string;
  timeoutMs?: number;
  responseType?: "json" | "text" | "bytes";
  maxRedirects?: number;
}): Promise<{
  status: number;
  headers: Record<string, string>;
  body: unknown;
}>;
```

`url` 必须是字符串。方法在原生端转成大写；请提供正常的 HTTP 方法，不依赖非法方法的容错行为。请求头值必须为字符串，空值被跳过；宿主提供默认 User-Agent，插件可按实际协议设置自己的头。

`body` 是原始字符串，不会自动 JSON 序列化、表单编码或推断 Content-Type。`bodyHex` 是二进制请求体的 hex 字符串。两者应互斥；当前实现同时收到它们时优先采用 `bodyHex`，这不是应依赖的作者约定。不要传 `Uint8Array`、Buffer、对象或 Axios 的 `data` 字段。

| `responseType` | `body` 的实际含义 |
| --- | --- |
| `"json"` | 通过 JSON 解析得到的值；无效 JSON 抛错 |
| `"text"` | UTF-8 解码字符串，非法序列使用替换字符 |
| `"bytes"` | 原始响应字节的小写 hex 字符串 |
| 省略 | Content-Type 包含 `json` 或正文看起来以 `{`/`[` 开头时解析 JSON；否则返回 UTF-8 字符串 |

响应头键名转为小写；同名响应头合并为一个字符串，以 `", "` 连接。需要保留二进制或自行按 GB18030 等编码解码时，显式使用 `responseType: "bytes"`。

HTTP 4xx/5xx 仍返回正常响应对象。网络、TLS、超时、无效参数、正文解析、响应超限及宿主拒绝联网会使 Promise reject。不要把这些失败改写成成功空页或“没有歌词”。HTTP 客户端不替插件定义重试或账号协议。

| 限制 | 当前行为 |
| --- | --- |
| 请求超时 | 默认 20,000 ms；正整数值最多 60,000 ms；`0` 使用默认值 |
| 重定向 | 默认 10，传入的非负整数最多按 10 处理；`0` 返回未跟随的重定向响应 |
| 响应正文 | 最多 16 MiB，分块读取时超限失败 |
| 网络/代理 | 由宿主工作区与代理设置管理；没有每次请求的 `proxy` 或 `signal` 参数 |

原生反序列化要求超时、重定向数量为合适的非负整数；负数、小数、错误类型不能当作可靠的默认值。内存与执行限制仍适用于请求体和响应处理；HTTP 请求体本身没有独立公开的 16 MiB 校验承诺。

### JSON 请求与明确的状态处理

下面是可复用的处理器内部辅助函数。`baseUrl` 应来自你拥有权限使用的真实服务；`.invalid` 只用于示例或离线测试替换。

```js
async function postJson(sdk, baseUrl, path, payload) {
  const response = await sdk.http.request({
    url: new URL(path, baseUrl).href,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    responseType: "json",
    timeoutMs: 10000,
  });
  if (response.status === 401) {
    throw Object.assign(new Error("需要登录后重试"), {
      code: "authentication_required",
    });
  }
  if (response.status === 429) {
    throw Object.assign(new Error("请求过于频繁"), { code: "rate_limited" });
  }
  if (response.status < 200 || response.status >= 300) {
    throw new Error("服务请求失败：HTTP " + response.status);
  }
  return response.body;
}
```

状态与错误代码的映射必须符合具体服务协议。例如 404 可能是曲目不存在，也可能是接口路径错误；只有确认含义后才返回 `null` 或抛 `track_unavailable`。不要记录响应中的账号凭据。

GET 查询和表单可以使用 URL 工具：

```js
const url = new URL("/search", baseUrl);
url.search = new URLSearchParams({ q: request.query, limit: String(request.limit) }).toString();
const response = await sdk.http.request({ url: url.href, responseType: "json" });

const form = new URLSearchParams({ id: String(request.entity.id), quality: "320k" });
const posted = await sdk.http.request({
  url: new URL("/source", baseUrl).href,
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: form.toString(),
  responseType: "json",
});
```

请求 API 的认证头和 `media.resolve` 返回媒体地址所需的播放头是两件事。需要播放器发送的 `headers` 应保留在媒体结果中，具体字段见[能力参考](./capabilities.md)。

## 字节、文本与压缩

```ts
sdk.bytes.encode(value: string, encoding?: "utf8" | "utf-8" | "base64" | "hex"): string;
sdk.bytes.decode(dataHex: string, encoding?: string): string;
sdk.bytes.compress(dataHex: string, format?: "zlib"): string;
sdk.bytes.decompress(dataHex: string, format?: "zlib"): string;
sdk.text.decodeHtml(value: string): string;
```

`encode` 把所标明编码的输入转换为 hex；默认编码是 UTF-8。`decode` 的输入始终是 hex：默认解码成 UTF-8，`"base64"` 输出标准 Base64，`"hex"` 输出规范化的小写 hex，其他文本编码采用原生 `encoding_rs` 支持的标签，例如 `"gb18030"`、`"gbk"`。编码参数不代表任意字符集的双向转码：`encode` 仅接受签名列出的四种值。

```js
const hex = sdk.bytes.encode("你好😀"); // "e4bda0e5a5bdf09f9880"
const text = sdk.bytes.decode(hex);    // "你好😀"
const base64 = sdk.bytes.decode(hex, "base64"); // "5L2g5aW98J+YgA=="
const sameHex = sdk.bytes.encode(base64, "base64");
const binary = sdk.bytes.encode("00fF80", "hex"); // "00ff80"
const legacyText = sdk.bytes.decode("c4e3bac3", "gb18030"); // "你好"
const title = sdk.text.decodeHtml("&lt;A&amp;B&gt;&#169;"); // "<A&B>©"
```

编码、解码会拒绝无效 hex、无效标准 Base64 和不支持的编码。Base64URL 不是自动启用的另一种输入格式。文本解码遇到无效字节时使用替换字符，不提供严格校验模式。`decodeHtml` 只替换 HTML 实体，不提供 DOM、选择器或 HTML 清洗器。

压缩与解压都返回 hex，默认且唯一的格式是 zlib。它们没有 pako 的选项对象、gzip、ZIP、raw-deflate 或直接返回字符串的模式。

```js
const plainHex = sdk.bytes.encode("[00:01.00]示例歌词");
const packedHex = sdk.bytes.compress(plainHex);
const unpackedHex = sdk.bytes.decompress(packedHex);
const lyricText = sdk.bytes.decode(unpackedHex);

// 真正的二进制接口应先校验 HTTP 状态，再按服务协议处理包头与正文。
const response = await sdk.http.request({ url: packetUrl, responseType: "bytes" });
if (response.status !== 200) throw new Error("获取数据包失败");
const packetHex = response.body;
```

| 操作 | 当前原生限制 |
| --- | --- |
| `bytes.encode` / `bytes.decode` | 已解码字节最多 16 MiB；进入转换前，输入字符串的 UTF-8 字节长度也不能超过 32 MiB |
| `bytes.compress` | hex 对应的输入与压缩输出均最多 16 MiB |
| `bytes.decompress` | 解压输出最多 16 MiB；损坏数据或超限抛错 |

解压路径没有单独公开的压缩输入长度检查，仍受宿主内存限制。不要将“16 MiB 输出上限”写成“支持无限压缩输入”。

## 加密与签名

```ts
sdk.crypto.hash(algorithm: "md5" | "sha1" | "sha256" | "sm3", dataHex: string): string;
sdk.crypto.hmacSha256(keyHex: string, dataHex: string): string;
sdk.crypto.randomBytes(size: number): string;
sdk.crypto.aesEncrypt(options: AesOptions): string;
sdk.crypto.aesDecrypt(options: AesOptions): string;

type AesOptions = {
  mode: "cbc" | "ecb";
  keyHex: string;
  ivHex?: string;
  dataHex: string;
  padding?: "pkcs7" | "none";
};
```

这些方法同步返回小写 hex。`hash("sha256", "616263")` 哈希的是 `abc` 三个字节；哈希文本 `"616263"` 应先 `bytes.encode("616263")`。输入不是 CryptoJS WordArray、密码字符串或 Base64；需要这些表示时先显式转换。

```js
const dataHex = sdk.bytes.encode("abc");
const sha256 = sdk.crypto.hash("sha256", dataHex);
// ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
const sm3 = sdk.crypto.hash("sm3", dataHex);
// 66c7f0f462eeedd9d1f2d46bdc10e4e24167c4875cf2f7a2297da02b8f4ba8e0
const mac = sdk.crypto.hmacSha256("0b".repeat(20), sdk.bytes.encode("Hi There"));
// b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7
const nonceHex = sdk.crypto.randomBytes(16); // 16 字节，即 32 个 hex 字符
```

随机字节取自操作系统随机源，单次最多 1 MiB。作者应传非负整数。SM3 复用 16 MiB 字节输入限制；其他哈希/HMAC/AES 当前没有同样的独立输入上限检查，仍受宿主内存、执行和协议大小约束。

AES 支持 16、24、32 字节原始密钥；CBC 必须提供 16 字节 IV，ECB 不使用 IV。`padding` 默认 `"pkcs7"`；`"none"` 要求明文长度为 16 字节倍数。解密要求密文按 16 字节对齐，PKCS#7 填充不合法会抛错。错误模式、填充、密钥长度和 IV 长度也会抛错。没有自动派生密钥或 OpenSSL 带盐封装。

```js
// NIST 测试向量；这些公开常量仅用于验证，不是服务凭据。
const options = {
  mode: "cbc",
  keyHex: "603deb1015ca71be2b73aef0857d77811f352c073b6108d72d9810a30914dff4",
  ivHex: "000102030405060708090a0b0c0d0e0f",
  dataHex: "6bc1bee22e409f96e93d7e117393172a",
  padding: "none",
};
const cipherHex = sdk.crypto.aesEncrypt(options);
// "f58c4c04d6e5f1ba779eabfb5f7bfbd6"
const plainHex = sdk.crypto.aesDecrypt({ ...options, dataHex: cipherHex });
```

通用 JSON 签名可以这样组合，但字段顺序、时间单位、密钥编码和签名位置必须由服务协议规定：

```js
function signedBody(sdk, payload, secretHex) {
  const body = JSON.stringify(payload);
  const signature = sdk.crypto.hmacSha256(secretHex, sdk.bytes.encode(body));
  return { body, headers: { "Content-Type": "application/json", "X-Signature": signature } };
}
```

这个辅助函数只对确切的请求正文签名；它没有定义任何音乐服务的认证算法，也不保证另一种 JSON 序列化顺序得到相同签名。

## 用户配置与持久化存储

### `manifest.userVariables` 与 `sdk.settings`

`userVariables` 是清单中的配置表单描述，值由宿主在加载插件前传入。当前 Flutter 配置页对每个字符串 `key` 创建一个 `TextField`：`name` 为标题，`hint` 为帮助文字，`defaultValue` 用于没有已保存值时填充输入框；`type: "password"` 仅遮掩文字。其他类型不会自动产生下拉框、开关、数字输入校验或特殊控件。

```js
// manifest 内的字段片段。
userVariables: [
  { key: "apiBase", name: "服务地址", hint: "填写完整 HTTPS 地址", defaultValue: "" },
  { key: "token", name: "访问令牌", type: "password", hint: "填写服务授权的令牌" },
]
```

当前配置页保存的是字符串映射；请在处理器中自行检查必填值、URL、范围或枚举。`defaultValue` 是表单显示行为，不是原生自动注入所有默认值的承诺。用户未打开或保存表单时，仍应处理缺失配置。

```js
function configuredBase(sdk) {
  const value = sdk.settings.apiBase;
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("请先在插件配置中填写服务地址");
  }
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("服务地址需要使用 HTTPS");
  return url;
}
```

配置保存通过宿主注册表激活流程生效，不会原地修改已经创建的 `sdk.settings`。`settings` 不是可写账户仓库。运行期更新的会话、缓存或登录状态应读取插件存储或服务结果；不要在模块求值时固定读取会变化的账号数据。密码输入遮掩也不构成密钥保险库、加密存储或登录 UI 的承诺。

### `sdk.storage`

```ts
sdk.storage.get(key: string): Promise<string | null | undefined>;
sdk.storage.set(key: string, value: string): Promise<void>;
sdk.storage.remove(key: string): Promise<void>;
```

公开作者声明把缺失值写作 `string | null`，但当前原生实现将 Rust `Option::None` 转为 JS `undefined`；如果把它直接作为处理器结果返回，JSON 桥又会归一化为 `null`。因此处理器内部应使用 `const raw = (await sdk.storage.get(key)) ?? null`，不要只用 `=== null` 判断。上面的签名同时列出这一实际差异；不依赖 set/remove 的返回值。

存储由宿主配置，按稳定插件包 ID 隔离，SQLite 文件位于宿主支持目录。在插件身份和清单通过校验后才绑定；未配置时调用会 reject，错误为 `plugin storage is not configured`。模块顶层没有可用的处理器 SDK，不应执行存储初始化 I/O。

键必须为非空字符串，UTF-8 长度最多 1024 字节。值只能为字符串；JSON 需要显式序列化。每个插件键和值的 UTF-8 字节总和最多 10 MiB；超限写入失败并回滚，保留此前值。每次写入是独立原子事务，没有公开的多键事务、列表、清空或 compare-and-swap API。

```js
async function readSession(sdk) {
  const raw = (await sdk.storage.get("session.v1")) ?? null;
  return raw === null ? null : JSON.parse(raw);
}

async function saveSession(sdk, session) {
  await sdk.storage.set("session.v1", JSON.stringify(session));
}

async function clearSession(sdk) {
  await sdk.storage.remove("session.v1");
}
```

为插件自己的存储结构设计版本、过期和无效值处理；更换稳定包 ID 会改变存储身份。账号变化也应让旧游标和账号缓存失效，详见[契约](./contract.md)。

## 日志和错误

`sdk.log.debug/info/warn/error(...args)` 同步记录诊断信息，参数按字符串转换并用空格连接，不提供浏览器开发者工具式对象展开。宿主为每个插件最多缓存 2000 条日志，并写入宿主诊断日志与 stderr。适当序列化不含敏感值的摘要，不输出 Cookie、令牌、密钥、完整签名请求或账户响应。

处理器抛普通 `Error`。以下精确的 `error.code` 字符串能跨越 QuickJS 边界，其余代码与附加属性没有业务传输承诺：

| 代码 | 作者应表达的情况 |
| --- | --- |
| `quality_unavailable` | 已确认该曲目没有所请求音质；允许下载协调器尝试其他音质 |
| `track_unavailable` | 曲目不可用 |
| `authentication_required` | 需要有效账号或授权 |
| `permission_denied` | 当前权限不允许此操作 |
| `rate_limited` | 服务明确限制请求频率 |
| `temporary_unavailable` | 已确认的临时故障 |
| `signature_expired` | 签名或短期凭据已过期 |

```js
throw Object.assign(new Error("该曲目暂不提供所选音质"), {
  code: "quality_unavailable",
});
```

没有 `sdk.errors.*` 工厂，也没有任意 `retryAfter` 字段的跨层语义。只把消息写成 `"quality_unavailable"` 不会产生该错误代码。普通网络、授权或共享配置失败不能伪装成缺少音质，否则会触发错误的重复请求。不要捕获全部错误并返回空页、`null`、伪造可播放地址或账号成功状态。

## 计时器、取消和执行边界

`setTimeout(callback, ms, ...args)` 返回数字 ID，只接受函数回调，等待时间在运行时限制为 1–60,000 ms；`clearTimeout(id)` 取消尚未触发的等待。没有保证延时精度，也没有字符串回调或 Node timer handle。

```js
await new Promise(resolve => setTimeout(resolve, 20));
const timer = setTimeout(() => { /* 本次调用仍存活时执行 */ }, 100);
clearTimeout(timer);
```

`URL` / `URLSearchParams` 由原生 URL 算法支持，可用于构造路径、转义查询和表单；不能据此假设整个 WHATWG 浏览器 API 存在。`AbortController` / `AbortSignal` 可以维护 JS 中的取消状态和监听器，但 `sdk.http.request` 不读取 `signal`。`AbortSignal.timeout` 使用同一套有 60 秒上限的计时器；不能把它当作任意长时限的网络取消机制。

原生 HTTP 和计时器属于发起它们的处理器调用范围。调用完成或被宿主取消时，未完成的相关原生任务会被取消；不要以未等待的请求或计时器安排“返回之后再保存”。停用、替换或关闭宿主会终止对应运行环境。`Promise.race` 只决定哪个 Promise 先返回，不是 SDK 的显式取消 API。

每个插件使用独立 QuickJS runtime/context，当前内存上限 128 MiB、栈上限 2 MiB，执行中断采用约 30 秒的 JS 截止时间。这个截止时间不是所有未解决 Promise 的统一墙钟超时；调用方预算、HTTP 超时、工作区限制和生命周期取消还有各自作用。不要设计永久等待、无限重试或依赖某个固定最长运行时间的协议。

安装前的临时清单检查会禁止初始化网络和计时器 I/O，也没有持久化存储或处理器执行；所以导出必须同步完成，把服务调用放到处理器里。没有包级域名权限清单或新的网络沙箱能力可从 `capabilities` 推导出来。

`lyrics.get` 返回对象后，宿主会对字符串 `rawLrc`、`translation`、`romanization` 运行共享原生解码，并补充 Rust 解析/导出结果与诊断字段。插件仍负责来源包与业务协议，SDK 不开放这些内部解析函数；不要自行伪造 `parsedLines` 来代替真实歌词。歌词完整结果和边界见[能力参考](./capabilities.md)。

## 实现依据与验证

本页依据客户端 `rust/crates/baka-plugin-host/src/v2.js`、`v2_bridge.js`、`host.rs`、`call_scope.rs`、`shim/{http,mod,crypto,storage,v2_native,web,timers}.rs` 与 `shim/web.js`；配置表单依据 `lib/features/plugins/plugins_page.dart` 的 `_variables` 以及 `lib/rust/bridge.dart` 的 `setPluginVariables`，环境装载依据 `rust/crates/baka-ffi/src/lib.rs` 的 `load_host_cancellable`。版本与仓库位置见[源码地图](./source-map.md)。

对本页字节/哈希/AES向量，可使用实际宿主的 `v2_pilot_sdk` 与原生 crypto 测试交叉验证。存储缺失值、权限/网络失败、取消和 4xx/5xx 都需要真实宿主测试，不能只依赖 Node 假 SDK。运行方法与离线 fixture 要求见[测试与发布](./testing-and-release.md)；本页示例本身不证明任何远程服务、账号授权或设备播放可用。
