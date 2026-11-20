# Phase 2 — Bảng Truy vết Yêu cầu (TICKET-02) & Bằng chứng Kiểm chứng

Lệnh chạy lại toàn bộ kiểm chứng tự động ở tag `phase-2`:

```bash
npm install && npm run build && npm test
```

## Bảng truy vết DoD & Acceptance Criteria (Contract v1.1)

| Mã | Yêu cầu TICKET-02 / Contract v1.1 | Cách kiểm chứng | Bằng chứng | Kết quả |
|---|---|---|---|---|
| AC-2.1 | Đồng bộ số liệu chuẩn & `game.contract.json` (`contract_version: "1.1"`) | Unit test đọc trực tiếp `game.contract.json` so sánh sâu với `TUNING` | `tests/sim.test.ts` (16/16 PASS) | **Đạt** |
| AC-2.2 | Lướt (Dash): `14 m/s`, `12` tick, hồi chiêu `90` tick, lướt trên không giữ nguyên `Y` | Unit test air-dash + Headless scenario `P2-01` | [`contract-report.md`](contract-report.md) (`P2-01`), `tests/sim.test.ts` | **Đạt** |
| AC-2.3 | Bùa Gió (`C1`, `C2`): `600` tick (`7.2 m/s`, Lướt không hồi chiêu), tái sinh `2700` tick | Unit test `600t` + `2700t` respawn + Headless scenario `P2-01` | [`contract-report.md`](contract-report.md) (`P2-01`), `tests/sim.test.ts` | **Đạt** |
| AC-2.4 | Đêm 2 (Đảo Cau): 2 đảo, cầu tre, 2 bục nhảy, rơi khỏi đảo `Y < -10` + hồi sinh `60` tick + `90` tick bất tử | Unit test + Headless scenario `P2-02` | [`contract-report.md`](contract-report.md) (`P2-02`: `landed B@x=51.237, fall@tick=300(lost=5), respawned@[0,0,0]`) | **Đạt** |
| AC-2.5 | Gió Lạc (Drifter): `idle/chase/flee`, cướp bỏ qua `invuln`/`safe_radius`, trúng Pulse thả đom đóm (`drifter_drop`) | Unit test (kể cả pulse lúc `chase`) + Headless scenario `P2-03` | [`contract-report.md`](contract-report.md) (`P2-03`: `steal@16(amt=3), pulse->drop@26(amt=3)`) | **Đạt** |
| AC-2.6 | Đêm 3 (Đảo Chuông): 3 tầng, 2 dốc `30°/150°`, bục nhảy tầng 1→2, Tháp Chuông `r=2`, Gió mạnh mỗi `30s` | Unit test leo dốc/bục/Tháp/gió + Headless scenario `P2-04` | [`contract-report.md`](contract-report.md) (`P2-04`: `landed Tier 2 y=6, wind active@1800`) | **Đạt** |
| AC-2.7 | Tạm dừng (`paused`/`resumed`, `sim_tick` & thời gian đóng băng, `state: "paused"`) | Unit test + Headless scenario `P2-05` | [`contract-report.md`](contract-report.md) (`P2-05`: `paused@11, frozen sim_tick=10, resumed@41`) | **Đạt** |
| AC-2.8 | Vùng an toàn `6m` đẩy bóng trong `≤ 30` tick (0 dmg) & đúng 5 trạng thái Bóng Mực (`spawning/wander/chase/recoil/stunned`) | Unit test (kể cả `recoil` `2.0m`, `S2<S10`) + Headless scenario `P2-06` | [`contract-report.md`](contract-report.md) (`P2-06`: `0 dmg, dist@tick30=6.020m`) | **Đạt** |
| AC-2.9 | Regression Phase 1 + Tất định 3 Đêm + Benchmark 21.600 tick `≤ 30s` + mã thoát `2` | Chạy `npm run verify:contract` trên toàn bộ `R01–R06`, `DET`, `PERF`, `ERR` | [`contract-report.md`](contract-report.md) (`R01–R06` PASS, `DET` N1/N2/N3 khớp SHA-256, `PERF` 21.600 tick < 0.4s) | **Đạt** |
| AC-2.10 | Chuỗi 3 Đêm, Menu, Pause UI, Cài đặt (localStorage), Âm thanh (BGM + 10 SFX), HUD chuẩn, Bảng màu chuẩn & FPS ≥ 30 | Build Vite production sạch (`npm run build:web`), HUD có bộ đếm FPS trực tiếp | `dist/web/` biên dịch 0 lỗi; *chưa đo tự động trên trình duyệt 1280×720 do Chrome remote debugging chưa bật — học viên mở `http://localhost:4173/` kiểm tra trực quan và xác nhận FPS thực tế trên máy* | **Đạt phần code/build (cần xác nhận FPS tay trên trình duyệt)** |
| QA-02 | Đánh giá độc lập Contract v1.1 bởi subagent khác người viết | Subagent `research` rà soát toàn bộ thay đổi Phase 2 | [`review.md`](review.md) — phát hiện 7 lỗi off-by-one/edge case và đã sửa + phủ test xanh | **Đạt** |
