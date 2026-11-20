# Changelog — Đảo Đèn Lồng

Mọi thay đổi quan trọng theo từng Phase của dự án, bao gồm đầy đủ **Breaking Changes** khi nâng cấp Test Contract.

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
