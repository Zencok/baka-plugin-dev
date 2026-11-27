# Baka 插件开发：V2 教程与 Skill

这是 Baka V2 插件开发的独立文档与工具仓库，同时提供可直接安装的 `baka-plugin-dev` skill。新插件只面向 V2；教程、API 参考、模板和检查工具在此集中维护。BakaMusic 应用仓库只保留开发入口引用。

插件成品仓库是 **`D:/Github/Music/baka-plugins/plugins/v2`**，本仓库提供开发方法与工具，不复制发行插件。当前接口依据 BakaMusicFlutter 的 Rust/QuickJS 宿主、共享契约测试及七个成品 V2 插件核对，见[来源与支持边界](references/source-map.md)。

## 开始开发

1. 阅读[从零编写第一个插件](references/quickstart.md)。
2. 按[完整开发教程](references/development-guide.md)实现你的数据源。
3. 查阅[包、实体与分页契约](references/contract.md)、[全部能力 API](references/capabilities.md)和[SDK 参考](references/sdk.md)。
4. 用[成品插件阅读指南](references/production-examples.md)定位真实实现。
5. 按[测试、导入与发布](references/testing-and-release.md)验证交付。

最小文件形式如下。它只演示格式，真正的插件应返回已接入数据源的结果：

```js
// @baka-provider 2
module.exports = {
  manifest: {
    apiVersion: 2, kind: 'provider',
    id: 'org.example.catalog', sourceId: 'example.v1',
    name: 'Example Music', author: 'Example author', version: '1.0.0',
    capabilities: ['search'],
  },
  handlers: {
    async search(request, sdk) {
      return { items: [], nextCursor: null };
    },
  },
};
```

## 模板和验证

需要 Node.js 20 或更新版本；离线工具只使用 Node 内置模块，无需安装 npm 依赖。

```powershell
# 在本仓库目录执行
npm test
node scripts/check.cjs assets/authoring/minimal-provider.js
node --check assets/authoring/minimal-provider.js
```

- [最小 provider](assets/authoring/minimal-provider.js)：HTTP 数据源起点，`.invalid` 地址需要替换。
- [最小 resolver](assets/authoring/minimal-resolver.js)：显式绑定的独立媒体解析器。
- [完整离线示例](assets/authoring/full-provider.js)：合成数据演示能力契约，不提供真实音乐服务。
- [类型声明](assets/authoring/types.d.ts)：编辑器补全，不是客户端需要安装的运行时依赖。
- [共享契约向量](assets/authoring/contract-vectors.json)：合法与非法包、实体和绑定的回归数据。

真实 QuickJS 验证需要 BakaMusicFlutter 编译的 `v2_probe`：

```powershell
$env:BAKA_V2_PROBE = 'D:/Github/Music/BakaMusicFlutter/rust/target/debug/examples/v2_probe.exe'
npm run test:native
```

Node 检查、真实宿主测试、已安装客户端验证和远程服务可用性是不同层次的证据。完整命令和核对方法见[测试说明](references/testing-and-release.md)。

## 安装 Skill

仓库根目录就是一个完整 skill。把仓库克隆到 Codex 的技能目录即可，例如 Windows 安装：

```powershell
git clone https://github.com/Zencok/baka-plugin-dev.git "$env:USERPROFILE/.codex/skills/baka-plugin-dev"
```

技能目录已存在时，在原副本更新，不要把第二份覆盖进去。有自定义 `CODEX_HOME` 时使用其 `skills/baka-plugin-dev` 目录。安装后开启新会话，使用：

```text
使用 $baka-plugin-dev，为我的 HTTPS 音乐目录开发 V2 provider，先实现搜索、歌词和音频解析。
```

也可以直接把 [SKILL.md](SKILL.md) 及其引用文件交给支持本地 skill 的工具。技能按任务读取相关参考，不会要求把全部实现和规范一次性塞入上下文。

## 维护约定

V2 接口变化时，同时更新声明、契约向量、示例、教程与对应测试。上游快照记录在 [UPSTREAM.json](UPSTREAM.json)，设计分工见 [DESIGN.md](DESIGN.md)。远程仓库为 [Zencok/baka-plugin-dev](https://github.com/Zencok/baka-plugin-dev)；应用仓库统一引用此入口。

复用文件的来源和声明见 [NOTICE.md](NOTICE.md) 与 [LICENSE](LICENSE)。插件自身的作者、许可证、授权和服务配置由插件维护者保留并明确声明。
