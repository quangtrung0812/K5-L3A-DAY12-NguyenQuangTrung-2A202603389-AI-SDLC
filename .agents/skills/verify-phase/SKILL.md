---
name: verify-phase
description: Quy trình tự kiểm chứng chuẩn trước khi gắn tag phase và phát hành v1.0.0 (hỗ trợ Contract v1.3, regression Phase 1–3, soak 10 Đêm, benchmark 1280x720, leaderboard export và QA review độc lập).
---

# Skill: Verify Phase (`verify-phase`)

Kích hoạt kỹ năng này trước mỗi lần chốt phase/release hoặc sau mọi thay đổi lớn vào `src/sim/`, `src/headless/`, `scripts/` hay `src/client/`.

## Các bước bắt buộc
1. **Typecheck & Build:** Chạy `npm run typecheck && npm run build` để đảm bảo cả bản headless (`dist/headless/`) và web 3D (`dist/web/`) biên dịch sạch, không lỗi TypeScript.
2. **Unit Tests & Regression:** Chạy `npm run test:unit` để kiểm tra:
   - Đồng bộ `game.contract.json` ↔ `src/sim/tuning.ts` (`contract_version: "1.3"`, có `bench_cmd`, `soak_cmd`).
   - Toàn bộ luật không bị thay thế từ Phase 1–3 (`17+` test cốt lõi + `createBenchSim` + `leaderboard`).
3. **Contract v1.3 Scenarios, Soak, Export & Determinism:** Chạy `npm run verify:contract` để:
   - Chạy đủ 21 kịch bản Contract v1.0–v1.2 (regression Phase 1–2, tính năng mới Phase 3, SHA-256 3 Đêm, hiệu năng 18.000 tick Đêm 3 `≤ 30s`, exit `2`).
   - Chạy kiểm chứng `soak_cmd` (`10` Đêm liên tiếp: `crashes = 0`, `mem_end_mb ≤ 1.2 × mem_start_mb`) và `run_cmd --export-leaderboard`.
   - Xuất báo cáo tự động vào `docs/proof/phase-4/contract-report.md`.
4. **Đo thật Benchmark & Soak cho Release (`bench.json`, `soak.json`):**
   - Chạy `npm run soak` → sinh `soak.json` ở thư mục gốc.
   - Chạy `npm run bench` → sinh `bench.json` ở thư mục gốc (`avg_fps ≥ 60`, `p1_low_fps ≥ 30`, `load_ms ≤ 10000`).
5. **Đánh giá độc lập & DoD Release:** Khởi chạy subagent `research` độc lập rà soát toàn bộ Phase 4 (`docs/proof/phase-4/review.md`), kiểm tra đủ `LICENSE`, `CREDITS.md`, `CHANGELOG.md` (4 phase), `docs/notes/retro.md`, `README.md` (≤ 3 lệnh), và chạy `npm run package:release`.
