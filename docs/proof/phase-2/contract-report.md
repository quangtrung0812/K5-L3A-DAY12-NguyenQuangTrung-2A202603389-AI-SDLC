# Phase 2 — Báo cáo Kiểm chứng Test Contract v1.1 (Tự động)

- **Lệnh chạy:** `npm run verify:contract`
- **Headless cmd:** `node dist/headless/headless/cli.js`
- **Contract version:** `1.1`
- **Node.js:** `v24.18.1` (win32/x64)

| Mã | Nhóm | Kịch bản kiểm chứng | Kết quả | Chi tiết đo được |
|---|---|---|---|---|
| R01 | Phase 1 Regression | Move + camera yaw + mote pickup & carry_capacity=10 | **PASS** | pos=[6,0,12], carried=10/10, motes_left=1 |
| R02 | Phase 1 Regression | Deposit 10 motes + light 5th lantern -> win (all_lit) with v1.1 score | **PASS** | won@tick=101, score=586 |
| R03 | Phase 1 Regression | Shade chase + hit + physical dropped motes + recoil + loss (no_flames) | **PASS** | hits@23&113, recoil+dropped verified, lost(no_flames) |
| R04 | Phase 1 Regression | Pulse (3D r=5m, cost 3) pushes 4m in 15 ticks & stuns 120 ticks (+5 score) | **PASS** | pulse@tick=6, shade x=8.167m (stunned), recovered@tick=140, score=5 |
| R05 | Phase 1 Regression | Lit lantern safe_radius (6m) blocks outside shade completely | **PASS** | minDist=6.020m > 6.0m, hits=0 |
| R06 | Phase 1 Regression | Dawn timeout ends game at exact tick 120 | **PASS** | lost(dawn) at exact tick=120 |
| P2-01 | Phase 2 Feature | Dash + Wind Charm (C1) zero-cooldown chain dash on Night 2 | **PASS** | charm C1 picked, 2 dashes in 15 ticks (cd=0s), pos.x=41.08m |
| P2-02 | Phase 2 Feature | Night 2 launchpad A->B + fall off island (Y<-10) + 60-tick respawn | **PASS** | landed B@x=51.237, fall@tick=300(lost=5), respawned@[0,0,0] |
| P2-03 | Phase 2 Feature | Drifter (Gió Lạc) steals ignoring invuln & drops all on Pulse | **PASS** | steal@tick=16(amt=3), pulse->drop@tick=26(amt=3) |
| P2-04 | Phase 2 Feature | Night 3 Tier 1->Tier 2 launchpad + periodic Wind activation (tick 1800) | **PASS** | landed Tier 2 y=6@[0,6,6.467], wind active@1800 dir=212.807° |
| P2-05 | Phase 2 Feature | Pause freezes sim_tick & time_left_s, emits paused/resumed | **PASS** | paused@11, frozen sim_tick=10 at wall ticks 20&30, resumed@41 |
| P2-06 | Phase 2 Feature | Safe zone pushes inside shade out to >=6m within <=30 ticks (0 dmg) | **PASS** | 0 damage during pushout, dist@tick30=6.020m >= 6.0m |
| DET | Determinism | Identical SHA-256 across 2 runs for Nights 1, 2, and 3 | **PASS** | N1=91dbecd6dc, N2=c7eb8878e1, N3=e690a0eb6e |
| PERF | Performance | Full Night 3 headless (21,600 ticks) finishes in <= 30s | **PASS** | 21,600 ticks completed in 262 ms (limit: 30,000 ms) |
| ERR | Error Handling | Invalid inputs/scenario/JSON -> exit 2; missing flag / bad night -> non-zero | **PASS** | bad_inputs=2, bad_scenario=2, malformed_json=2, bad_night=1 |
