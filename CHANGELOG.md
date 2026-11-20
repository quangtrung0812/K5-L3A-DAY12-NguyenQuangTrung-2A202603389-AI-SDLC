# Changelog — Đảo Đèn Lồng

Mọi thay đổi quan trọng theo từng Phase của dự án, bao gồm đầy đủ **Breaking Changes** khi nâng cấp Test Contract.

---

## [1.0.0] — Phase 4: TICKET-04 *"Bình minh: phát hành v1.0.0"* (Test Contract v1.3)

### Added (Non-functional, Accessibility, Leaderboard & Release)
- **Test Contract v1.3 (`game.contract.json`):** Nâng `contract_version` lên `"1.3"`, bổ sung `bench_cmd` (`node scripts/bench.mjs`), `soak_cmd` (`node --max-semi-space-size=1 --expose-gc dist/headless/headless/soak.js`) và cập nhật `run_cmd` (`node scripts/run.mjs`) hỗ trợ xuất bảng xếp hạng. Toàn bộ luật và kiểm chứng Contract v1.0–v1.2 giữ nguyên 100%.
- **Chế độ Benchmark chuẩn (`scripts/bench.mjs` + `createBenchSim` + `syncBench`):** Mở cửa sổ `1280×720` không toàn màn hình với cờ tắt VSync (`--disable-frame-rate-limit --disable-gpu-vsync`), chạy cảnh chuẩn Đêm 1 (`200` Bóng Mực `wander` instanced, `100` đom đóm instanced, `L1–L3` sáng `fuel=100`, tắt toàn bộ hiệu ứng sáng tạo thêm, camera bay vòng `r=30m, Y=15m` ngược chiều kim đồng hồ `15s/vòng`), khởi động `3s` + đo `--duration` giây và xuất `bench.json` đúng chuẩn v1.3.
- **Soak test đa Đêm (`src/headless/soak.ts`):** Chạy `10` Đêm liên tiếp trong cùng tiến trình (Đêm `1 → 2 → 3` xoay vòng, seed `7 + i`, input ngẫu nhiên theo seed), đo `mem_start_mb`, `mem_end_mb`, `crashes`, `results`, `duration_s` và xuất `soak.json`.
- **Bảng xếp hạng cục bộ (`src/sim/leaderboard.ts`, `scripts/run.mjs`, `index.html`, `src/client/main.ts`):**
  - Cho phép nhập tên (`3–12` ký tự `[A-Za-z0-9_]` + hỗ trợ tiếng Việt có dấu) sau chiến thắng Đêm 3 hoặc sau khi thua ở bất kỳ Đêm nào; lưu Top 10 ra đĩa cục bộ (`~/.dao-den-long/leaderboard.json`), sắp xếp điểm giảm dần (bằng điểm ai đạt trước đứng trên).
  - Màn hình Bảng xếp hạng từ Menu chính và lệnh CLI `node scripts/run.mjs --export-leaderboard out.json`.
- **Trợ năng / Dễ tiếp cận (`index.html`, `src/client/style.css`, `src/client/main.ts`, `src/client/scene.ts`):**
  - Đổi phím toàn bộ 9 hành động kèm phát hiện trùng phím & nút **Khôi phục mặc định** (lưu `localStorage`).
  - Phụ đề & chỉ báo hình ảnh cho: Bóng Mực xuất hiện (kèm mũi tên chỉ hướng ở mép màn hình), gió sắp thổi, 10 giây cuối, và đèn `fuel < 30`.
  - Chế độ **Giảm chuyển động** (tắt rung camera, giật FOV, nhún chạy và hiệu ứng chớp màn hình).
  - Cỡ chữ UI tối thiểu **`18 px`** ở `1280×720` kèm tùy chọn **Chữ lớn (`×1.25` = `22.5 px`)**.
- **Đóng gói phát hành v1.0.0:** Thêm [`LICENSE`](LICENSE) (MIT), [`CREDITS.md`](CREDITS.md), [`docs/notes/retro.md`](docs/notes/retro.md), script đóng gói [`scripts/package-release.mjs`](scripts/package-release.mjs), ảnh chụp màn hình thật và bộ bằng chứng `docs/proof/phase-4/`.

---

## [0.3.0] — Phase 3: TICKET-03 *"Đèn cạn dầu"* (Test Contract v1.2)

### Breaking Changes (Phá vỡ tương thích so với v1.1 / Phase 2)
- **Contract version:** Nâng `game.contract.json` từ `"1.1"` lên `"1.2"`.
- **Luật thắng / thua (`game_over.reason`):**
  - **Bỏ hoàn toàn** chiến thắng sớm `all_lit` — thắp sáng toàn bộ đèn không còn kết thúc Đêm.
  - Thay bằng chiến thắng **`dawn_survived`**: còn sống đến hết giờ (bình minh) với số đèn đang sáng `≥ ceil(0.6 × tổng đèn)` (Đêm 1: `3/5`, Đêm 2: `4/6`, Đêm 3: `5/7`).
  - Hết giờ mà số đèn sáng `< ngưỡng` → thua `dawn`; hết Ngọn Lửa (kể cả đúng tick bình minh) → luôn thua `no_flames`.
- **Thời lượng Đêm 1 / 2 / 3:** Rút ngắn từ `300 / 330 / 360 s` xuống **`240 / 270 / 300 s`**.
- **Nhiên liệu đèn & Tương tác đèn đang sáng:**
  - Đèn sáng bắt đầu với `fuel = 100`, tự hao `1.0/giây` (`1/60` mỗi tick) và **tắt** khi `fuel ≤ 0` (`deposited = 0`, `ever_lit = true`, phát `lantern_out`).
  - Đèn đang sáng nhưng chưa đầy dầu (`fuel < 100`) nay nhận châm dầu qua Tương tác (`+10 fuel/đom đóm`, sự kiện `refuel`); đèn đã từng sáng chỉ tốn `5` đom đóm để thắp lại (`relight: true`).
- **Vùng an toàn & Bóng Mực hút dầu (`drain`):**
  - Đèn có `fuel < 30` **mất vùng an toàn `6 m`** (đúng `30` vẫn còn).
  - Thêm trạng thái Bóng Mực **`drain`**: từ `wander` đi tới đèn sáng `fuel < 30` gần nhất, vào `≤ 2 m` đứng hút `5 fuel/giây` (cộng dồn, ghi sự kiện `fuel_drain` mỗi `60` tick). Hết choáng luôn trở về `wander`.
- **Công thức điểm mới (thay thế hoàn toàn v1.1):**
  - Nạp 1 đom đóm (thắp mới, thắp lại hoặc châm dầu): `+10` → **`+5`**.
  - Thắp lại đèn đã từng sáng (`relight`): **`+40`** (thắp lần đầu giữ `+100`).
  - Tỏa Sáng trúng Bóng Mực đang `drain`: tổng **`+15`** (thay vì `+5`).
  - **Bỏ** thưởng thời gian (`per_second_left`); thay bằng thưởng bình minh khi thắng: **`+50 + floor(fuel)`** mỗi đèn đang sáng + `+50` mỗi Ngọn Lửa còn lại.
- **Schema JSONL (Snapshot / Scenario / Events):**
  - Snapshot đèn thêm `fuel`, `ever_lit`, `relit_count`; `player` thêm `capacity`.
  - Event `lantern_lit` thêm trường `relight: boolean`; bổ sung các event `refuel`, `lantern_out`, `fuel_drain`.
  - Scenario hỗ trợ `lanterns[].fuel`, `lanterns[].ever_lit`, `player.successful_lights`, `shades[].target_lantern_id` và `shades[].state = "drain"`.

### Added (Tính năng mới)
- **Sức chứa tăng dần:** `capacity = min(20, 10 + 2 × successful_lights)` (reset đầu mỗi Đêm), hiển thị động trên thanh đom đóm HUD.
- **Chế độ mù màu ("Bảng màu dễ phân biệt"):** Lưu trong `localStorage`; đổi viền & mắt Bóng Mực sang `#00B3FF`, màu cảnh báo UI sang `#FFFFFF` kèm biểu tượng `⚠`.
- **Phân biệt hình dạng đèn không cần màu:** Đèn tắt xẹp `20%` kèm vết rách giấy; đèn sáng có thanh nhiên liệu 3D nổi phía trên và nhấp nháy `1 Hz` khi `fuel < 30`.
- **Tài liệu thiết kế:** Thêm [ADR-001](docs/notes/adr-001-lantern-fuel-and-dawn-win.md), [CHANGELOG.md](CHANGELOG.md), bộ kiểm chứng Contract v1.2 và bằng chứng `docs/proof/phase-3/`.

---

## [0.2.0] — Phase 2: TICKET-02 *"Ba hòn đảo"* (Test Contract v1.1)

### Changed & Added
- Chuẩn hóa toàn bộ hằng số vật lý/gameplay theo Contract v1.1 (`player_speed = 6`, `carry_capacity = 10`, `lantern_cost = 10`, bảng màu 20 mã, thứ tự 12 bước/tick).
- Mở rộng thành chiến dịch **3 Đêm** (*Đảo Bến*, *Đảo Cau*, *Đảo Chuông*) với Lướt (`Dash`), Bùa Gió (`Wind Charm`), Gió Lạc (`Drifter`), rơi biển mây (`Y < -10`), Gió mạnh Đêm 3 và Tạm dừng (`Pause`).
- Bổ sung giao diện chiến dịch 3 Đêm, cài đặt âm lượng & độ nhạy chuột, âm thanh Web Audio ngũ cung, tạo hình 3D client-only (Scarlet & Doro) và cuộn chuột zoom.

---

## [0.1.0] — Phase 1: PRD-0 *"Đêm 1 — Đảo Bến"* (Test Contract v1.0)

### Added
- Khởi tạo kiến trúc tách lõi thuần TypeScript (`src/sim/`), CLI headless JSONL tất định (`src/headless/`), giao diện 3D Three.js (`src/client/`), Harness AI (`AGENTS.md`, skills, hooks, CI) và bộ kiểm chứng Contract v1.0.
