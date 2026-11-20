# Phase 3 — Báo cáo Kiểm chứng Test Contract v1.2 (Tự động)

- **Lệnh chạy:** `npm run verify:contract`
- **Headless cmd:** `node dist/headless/headless/cli.js`
- **Contract version:** `1.2`
- **Node.js:** `v24.18.1` (win32/x64)

| Mã | Nhóm | Kịch bản kiểm chứng | Kết quả | Chi tiết đo được |
|---|---|---|---|---|
| R01 | Phase 1–2 Regression | Move + camera yaw + mote pickup & initial carry_capacity=10 | **PASS** | pos=[6,0,12], carried=10/10, motes_left=1 |
| R02 | Phase 1–2 Regression (v1.2) | Deposit 10 motes + light 5th lantern -> relight:false, score=150, capacity=12, NO early win | **PASS** | lit@101 (relight=false), state=playing (no early win), score=150, capacity=12 |
| R03 | Phase 1–2 Regression | Shade chase + hit + physical dropped motes + recoil + loss (no_flames) | **PASS** | hits@23&113, recoil+dropped verified, lost(no_flames) |
| R04 | Phase 1–2 Regression | Pulse (3D r=5m, cost 3) pushes 4m in 15 ticks & stuns 120 ticks (+5 score) | **PASS** | pulse@tick=6, shade x=8.167m (stunned), recovered@tick=140, score=5 |
| R05 | Phase 1–2 Regression | Lit lantern safe_radius (6m, fuel>=30) blocks outside shade completely | **PASS** | minDist=6.020m > 6.0m, hits=0 |
| R06 | Phase 1–2 Regression | Dawn timeout with < 3/5 lit ends game lost(dawn) at exact tick 120 | **PASS** | lost(dawn) at exact tick=120 |
| P2-01 | Phase 1–2 Regression | Dash + Wind Charm (C1) zero-cooldown chain dash on Night 2 | **PASS** | charm C1 picked, 2 dashes in 15 ticks (cd=0s), pos.x=41.08m |
| P2-02 | Phase 1–2 Regression | Night 2 launchpad A->B + fall off island (Y<-10) + 60-tick respawn | **PASS** | landed B@x=51.237, fall@tick=300(lost=5), respawned@[0,0,0] |
| P2-03 | Phase 1–2 Regression | Drifter (Gió Lạc) steals ignoring invuln & drops all on Pulse | **PASS** | steal@tick=16(amt=3), pulse->drop@tick=26(amt=3) |
| P2-04 | Phase 1–2 Regression | Night 3 Tier 1->Tier 2 launchpad + periodic Wind activation (tick 1800) | **PASS** | landed Tier 2 y=6@[0,6,6.467], wind active@1800 dir=212.807° |
| P2-05 | Phase 1–2 Regression | Pause freezes sim_tick & time_left_s, emits paused/resumed | **PASS** | paused@11, frozen sim_tick=10 at wall ticks 20&30, resumed@41 |
| P2-06 | Phase 1–2 Regression | Safe zone pushes inside shade out to >=6m within <=30 ticks (0 dmg) | **PASS** | 0 damage during pushout, dist@tick30=6.020m >= 6.0m |
| P3-01 | Phase 3 Feature | Lantern fuel decay (1/s) + refuel (+10/mote, +5 score) to 100 | **PASS** | refuel#1@61(amt=3->100), refuel#2@66(amt=1->100), score=20 |
| P3-02 | Phase 3 Feature | Fuel reaches 0 -> lantern_out + relight costs 5 motes (relight:true, +40 bonus) | **PASS** | lantern_out@60, relight@66(cost=5, relit_count=1, cap=12), score=65 |
| P3-03 | Phase 3 Feature | Shade wander -> weak lantern drain (5/s, fuel_drain/60t) -> aggro <=6m + refuel >=30 | **PASS** | drain@snap40, fuel_drain@90(fuel=18.5), aggro@snap200, refuel->77.5 |
| P3-04 | Phase 3 Feature | Pulse hitting draining shade awards total +15 score (not +5) & stuns 120t | **PASS** | pulse@tick=1 on drain shade -> score=15, state=stunned |
| P3-05 | Phase 3 Feature | Dawn survival win (>= ceil(0.6*5)=3/5) -> dawn_survived + exact lantern/flame score | **PASS** | won(dawn_survived)@120, 3/5 lit, score=394 (exact dawn bonus) |
| P3-06 | Phase 3 Feature | Dynamic carry capacity (10 + 2*successful_lights) collects 14/14 when successful_lights=2 | **PASS** | capacity=14, carried=14/14, motes_left=1 |
| DET | Determinism | Identical SHA-256 across 2 runs for Nights 1, 2, and 3 (Contract v1.2) | **PASS** | N1=c8fe3082d6, N2=1e94571367, N3=5d26226c63 |
| PERF | Performance | Full Night 3 headless (18,000 ticks = 300s v1.2) finishes in <= 30s | **PASS** | 18,000 ticks completed in 483 ms (limit: 30,000 ms) |
| ERR | Error Handling | Invalid v1.2 inputs/scenario/JSON -> exit 2; bad night -> non-zero | **PASS** | bad_inputs=2, bad_scenario=2, bad_fuel=2, malformed_json=2, bad_night=1 |
