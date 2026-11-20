# Phase 1 — Báo cáo Kiểm chứng Test Contract v1.0 (Tự động)

- **Lệnh chạy:** `npm run verify:contract`
- **Headless cmd:** `node dist/headless/headless/cli.js`
- **Node.js:** `v24.18.1` (win32/x64)

| Mã | Kịch bản kiểm chứng | Kết quả | Chi tiết đo được |
|---|---|---|---|
| S01 | Move + camera yaw + mote pickup & carry capacity | **PASS** | pos=[6,0,12], carried=5/5, motes_left=1, score=50 |
| S02 | Deposit + light 5th lantern -> win (all_lit) with bonus score | **PASS** | won at tick=101, score=860 |
| S03 | Shade chase + hit + drop ratio + invuln + loss (no_flames) | **PASS** | hits at ticks 26 & 116 (gap=90), lost(no_flames) |
| S04 | Pulse pushes shade by 6m, stuns for 3s, awards stun score | **PASS** | pulse@tick=6, shade x=10.65m (stunned), recovered@tick=200 |
| S05 | Lit lantern safe_radius keeps shade strictly outside 5.5m | **PASS** | minDist=5.520m > safe_radius=5.5m, hits=0 |
| S06 | Dawn timeout ends game at exact tick when time_left_s hits 0 | **PASS** | lost(dawn) at exact tick=120 |
| DET | Determinism check: two Night 1 runs with seed=1337 produce identical SHA-256 | **PASS** | SHA-256=1d8b04ba3dd75e52... (byte-identical, 32 JSONL lines) |
| ERR | Invalid inputs/scenario files exit with code 2; missing flag exits non-zero | **PASS** | bad_inputs -> exit 2, bad_scenario -> exit 2, malformed_json -> exit 2, missing_arg -> exit 1 |
