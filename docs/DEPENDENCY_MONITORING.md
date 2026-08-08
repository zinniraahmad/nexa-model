# Dependency security monitoring

Owner: Zinnira Ahmad  
Review frequency: weekly and before every production deployment  
Last reviewed: 8 August 2026

Run:

```powershell
npm audit --omit=dev
npm audit
npm outdated
```

Current position:

- Production dependency audit: 0 known vulnerabilities.
- Development tooling audit: 0 known vulnerabilities.
- Seven previously tracked transitive advisories originated from `nanoid` through Vite/PostCSS and `undici` through Miniflare/Wrangler. Registry metadata later exposed patched dependency paths on 8 August 2026.
- Vite was updated to 8.2.1, Wrangler to 4.120.0, Miniflare to 5.20260801.1-alpha, Undici to 7.29.0 and Nano ID to 3.3.18. The full regression suite and both production builds passed after the update.

Do not use `npm audit fix --force` automatically. When future advisories appear, update on a branch, run the complete test/build/audit suite and deploy only after production-flow regression testing.
