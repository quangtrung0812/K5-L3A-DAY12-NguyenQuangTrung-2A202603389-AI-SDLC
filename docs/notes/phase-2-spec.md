# Phase 2 — Đặc tả TICKET-02 ("Ba hòn đảo"), Thay đổi Thiết kế & Tiêu chí Nghiệm thu

## 1. Cập nhật so với giả định Phase 1 (và lý do cập nhật test cũ)

TICKET-02 chuẩn hóa toàn bộ hằng số gameplay sang **Test Contract v1.1** để đồng nhất cảm giác chơi giữa mọi bài nộp:

| Thông số / Luật | Phase 1 (tự chọn) | Phase 2 (Chuẩn hóa bắt buộc) | Ảnh hưởng tới test Phase 1 |
|---|---|---|---|
| `carry_capacity` / `lantern_cost` | `5` / `4` | `10` / `10` | Cập nhật số lượng đom đóm trong `S01`, `S02` và unit test |
| `pickup_radius` / `interact_radius` | `1.6` / `2.6` | `1.0` (kèm `|Δy| ≤ 1.5`) / `2.0` | Cập nhật tọa độ test nhặt & nạp đèn |
| `pulse_cost` / `radius` / `stun` / `push` | `1` / `7` / `3s` / `6m` | `3` / `5m` (3D từ `y+0.8`) / `2s` (120 tick) / `4m` (trong 15 tick) | Cập nhật `S04` kiểm tra đẩy dần 15 tick & choáng 120 tick |
| `safe_radius` | `5.5` (đẩy tức thì) | `6.0` (đẩy ra mép trong `≤ 30` tick nếu đang ở trong lúc đèn thắp) | Cập nhật `S05` kiểm tra ngưỡng `6.0m` + thêm `P2_S06` kiểm tra đẩy 30 tick |
| `shade_speed` / `shade_hit_radius` | `4.2` / `1.2` | `4.0` (Đêm 3: `4.5`) / `1.0` (kèm `|Δy| ≤ 1.5`, recoil 2m/60 tick) | Cập nhật `S03` & kiểm tra 5 tên trạng thái chuẩn (`spawning/wander/chase/recoil/stunned`) |
| `fall_enabled` | `false` (chặn biên đảo) | `true` (rơi `Y < -10`: −1 Ngọn Lửa, mất hết đom đóm, chờ 60 tick hồi sinh + 90 tick bất tử) | Gỡ unit test cũ "chặn tại mép đảo 37.5m" (thay bằng luật rơi khỏi đảo) |
| Đom đóm bị rơi khi trúng đòn | Tan biến | Rơi vật lý quanh Mây (`1.5–2.5m`), `kind: "dropped"`, `ttl: 480` tick, nhặt lại từ tick sau | Cập nhật `S03` kiểm tra đom đóm rơi xuất hiện trong `snapshot.motes` |
| Tính điểm (`score.*`) | `+10` lúc nhặt, `+25` stun, `+5/s` thắng | `+10` lúc **nạp**, `+100` thắp đèn, `+5` mỗi con trúng Pulse, `+2/s` & `+50/lửa` lúc thắng | Cập nhật công thức kỳ vọng trong `S01`, `S02`, `S04` |
| Thời lượng Đêm 1 / 2 / 3 | `240s` | `300s` / `330s` / `360s` | Cập nhật `game.contract.json` và `S06` |
| Sự kiện khởi đầu | Không có | Thêm `night_start { night }` ở tick 1 đầu tiên của simulation | Cập nhật kỳ vọng danh sách event tick 1 |

## 2. Giả định bổ sung cho các chi tiết Phase 2

1. **Vị trí xuất phát Đêm 3 (Đảo Chuông):** Tâm `(0, 0)` của Đảo Chuông là tầng 2 (`r ≤ 8, Y = 6`) với Tháp Chuông (`r ≤ 2`) chiếm đúng tâm. Khi không có `scenario.player.pos`, Mây xuất phát tại `(0, 0, -12)` trên tầng 0 (`Y = 0`), quay mặt `+Z` hướng về Tháp Chuông và hai con dốc.
2. **Tăng tốc / dừng (`≤ 0.1s`):** Áp dụng vận tốc mục tiêu tức thời (`0s ≤ 0.1s`) để vừa phản hồi gọn vừa giữ độ chính xác tuyệt đối với các kịch bản regression đo quãng đường `v × t`.
3. **Điểm sương sinh Gió Lạc (Đêm 2 & 3):** Dùng tập điểm sinh Bóng Mực của màn (cách người chơi `≥ 15m`), chọn tất định qua PRNG. Trạng thái `idle` lượn chậm `2 m/s` theo quỹ đạo mượt ở mặt phẳng mặt đất `Y = 0` (độ cao bay nổi chỉ là hiển thị 3D trên client).
4. **Cảnh báo gió Đêm 3:** Gió mạnh kích hoạt chu kỳ mỗi `1800` tick (`30s`), kéo dài `300` tick (`5s`), báo trước `120` tick (`2s`) bằng lá bay và âm thanh gió trên client.
5. **Tương tác & Bóng Mực trên Đêm 3 đa tầng:** Chênh cao `> 0.45m` bị chặn bởi vách đứng tầng; 2 dốc rộng `3m` tại góc `30°` và `150°` (`r ∈ [24, 30]`) nối mượt `Y = 0 ↔ Y = 3`; Tháp Chuông bán kính `2m` tại tâm chặn đi xuyên qua.

## 3. Tiêu chí Nghiệm thu (Acceptance Criteria) cho từng mục Phần 3 & Contract v1.1

| Mã | Hạng mục (Phần 1–4) | Tiêu chí kiểm chứng ("Làm A thì thấy B") | Cách kiểm chứng |
|---|---|---|---|
| AC-2.1 | Số liệu chuẩn & Contract v1.1 | `game.contract.json` (`contract_version: "1.1"`) khớp 100% `TUNING` gồm đủ khóa mới (`dash_*`, `night2/3_duration_s`) | Unit test `tuning` sync |
| AC-2.2 | Lướt (Dash) | Nhấn `dash` → di chuyển `14 m/s` trong đúng `12` tick (`0.2s`), phát event `dash {}`, hồi chiêu `90` tick (`1.5s`) từ lúc bắt đầu; lướt trên không giữ nguyên `Y` | Unit test + Scenario `P2_S01_dash_charm` |
| AC-2.3 | Bùa Gió (`C1`, `C2`) | Nhặt Bùa Gió → phát `charm_picked { charm_id, charm_ticks: 600 }`, tốc chạy `7.2 m/s`, Lướt hồi chiêu `0s`, bùa tái sinh sau `2700` tick | Unit test + Scenario `P2_S01_dash_charm` |
| AC-2.4 | Đêm 2 (Đảo Cau) + Cầu tre + Bục nhảy + Rơi khỏi đảo | Chạy qua cầu tre `x ∈ [26,44], z ∈ [-2,2]` tới đảo B; chạm bục `(20,0,18)` bay `vy=14, vh=24` đáp an toàn trong đảo B; bước ra biển mây `Y < -10` → `player_hit { by: "fall", lost }`, chờ 60 tick rồi hồi sinh với 90 tick bất tử | Unit test + Scenario `P2_S02_night2_launchpad_fall` |
| AC-2.5 | Gió Lạc (Drifter) | Trạng thái `idle → chase` khi `carried ≥ 5 && dist ≤ 15m`; chạm `≤ 1.2m` cướp `min(3, carried)` phát `drifter_steal`, bỏ qua `invuln` & `safe_radius`; trúng Pulse khi đang `flee` thả toàn bộ đom đóm phát `drifter_drop` và biến mất sau `120` tick | Unit test + Scenario `P2_S03_drifter` |
| AC-2.6 | Đêm 3 (Đảo Chuông): 3 tầng, dốc, bục nhảy, Tháp Chuông, Gió mạnh | Leo dốc `30°` từ `Y=0` lên `Y=3`; chạm bục `(0,3,13)` đáp lên tầng 2 (`Y=6`); không đi xuyên Tháp Chuông (`r < 2`); gió mạnh kích hoạt chu kỳ `30s` đẩy `2 m/s` đúng `wind.dir_deg` | Unit test + Scenario `P2_S04_night3_tiers_wind` |
| AC-2.7 | Tạm dừng (`paused`/`resumed`) | Nhấn `pause` → phát `paused {}`, snapshot ghi `state: "paused"`, `tick` vẫn tăng nhưng `sim_tick`, `time_left_s`, cooldown, TTL đứng yên; nhấn lại `pause` → phát `resumed {}`, chạy tiếp chính xác | Unit test + Scenario `P2_S05_pause` |
| AC-2.8 | Vùng an toàn 6m đẩy 30 tick & 5 trạng thái Bóng Mực | Bóng đang ở trong `6m` khi đèn thắp bị đẩy ra mép `≥ 6m` trong `≤ 30` tick và không gây sát thương; dùng đúng 5 tên trạng thái `spawning/wander/chase/recoil/stunned` | Unit test + Scenario `P2_S06_safe_pushout` |
| AC-2.9 | Hiệu năng headless & Tất định 3 Đêm | Chạy Đêm 3 đủ `21.600` tick xong trong `≤ 30s`; chạy 2 lần cùng seed cho SHA-256 giống hệt trên Đêm 1, 2, 3 | Script `verify-contract.mjs` (`PERF` & `DET`) |
| AC-2.10 | Chuỗi 3 Đêm, Menu, Pause UI, Cài đặt (lưu localStorage), Âm thanh, HUD đầy đủ, Bảng màu chuẩn & FPS ≥ 30 | Bản web build sạch; đủ menu chính, lời Ông Đăng đầu mỗi Đêm, kết quả & màn Bình Minh sau Đêm 3, pause menu `Esc/P`, lưu volume & độ nhạy chuột, nhạc nền + 10 SFX, HUD đủ bố cục chuẩn, bảng màu chuẩn & đèn môi trường `0.15 + 0.55*(lit/total)` | Build Vite + kiểm tra thực tế trên trình duyệt |
