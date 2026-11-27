# Baka plugin developer repository

- This repository owns the V2 plugin authoring skill and public developer tutorials. Keep `SKILL.md` short; put task-specific detail in `references/` and executable authoring material in `assets/authoring/`.
- Current implementation, shared contract vectors and finished public V2 providers are the evidence for API claims. See `references/source-map.md` and `UPSTREAM.json`; never replace implementation evidence with old proposals.
- Publish one source JavaScript artifact with exact first line `// @baka-provider 2` and synchronous `module.exports = { manifest, handlers }`. No V1/MusicFree/LX runtime tutorials, npm compatibility shims or old method aliases.
- Package ID, source protocol and typed entity identity are distinct. Preserve original authors and full metadata. Resolver selection never changes entity ownership.
- Native SDK services are generic primitives. Source-specific protocols remain in plugins. Do not invent SDK functions or assume an exposed handler creates a product UI.
- Keep tests offline and deterministic by default. Only execute trusted plugin source. Native tests use the configured real V2 probe, never represent a Node VM as the production sandbox.
- Run `npm test` before commits. When changing examples, also run `npm run test:native` with `BAKA_V2_PROBE` configured. Preserve upstream notices. Do not publish or push unless requested.
