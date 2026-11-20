# Phase 1 — Phân tích Yêu cầu, Giả định & Tiêu chí Nghiệm thu

## 1. Kiến trúc & Lựa chọn công nghệ
- **Ngôn ngữ & Stack:** TypeScript + Three.js + Vite (Web 3D) + Node.js (Headless CLI).
- **Lý do:** Chạy đa nền tảng (Windows / macOS / Linux) với tối đa 3 lệnh, không cần GPU khi chạy headless (`node dist/headless/headless/cli.js`), tách biệt tuyệt đối lõi simulation (`src/sim/`) khỏi lớp hiển thị (`src/client/`).

## 2. Giả định cho các chỗ mơ hồ trong PRD-0

| Hạng mục | Mô tả mơ hồ trong PRD-0 | Giả định áp dụng ở Phase 1 |
|---|---|---|
| Kích thước đảo & rơi khỏi đảo | "Một hòn đảo tròn có 5 Đèn Lồng Lớn", `fall_enabled` tự chọn | Đảo tròn bán kính `38m`, `fall_enabled: false`. Trong chế độ chơi thường nhân vật bị chặn mềm tại viền đảo (`37.5m`). Nếu scenario đặt thực thể xa hơn, biên động mở rộng theo `maxDist + 10m` để không cản kịch bản test. |
| Vị trí 5 Đèn Lồng Lớn mặc định | Chưa quy định tọa độ cụ thể | `L1..L5` bố trí đều trên vòng tròn bán kính `22m` quanh tâm `(0, 0, 0)`, góc bắt đầu `0°` cách nhau `72°` (cách nhau `~25.9m > 2 * safe_radius`). |
| Số lượng & tái sinh đom đóm | "Xuất hiện rải rác trên đảo, nhặt được" | Khi `random_motes !== false`: khởi tạo 20 đom đóm ở bán kính `5m..33m` bằng PRNG có seed; khi số lượng `< 20`, tái sinh 1 con mỗi `3s` (180 tick) để tránh kẹt tài nguyên. Khi `random_motes: false`: chỉ dùng danh sách scenario, không tái sinh. |
| Sinh Bóng Mực | "Bóng Mực xuất hiện và đuổi người chơi" | Khi `random_shades !== false`: khởi tạo 2 Bóng Mực (`S1`, `S2`) cách tâm `22m..30m` ở tick 0 (không phát event lúc dựng); mỗi `35s` sinh thêm 1 con (tối đa 5 con) cách người chơi `>= 18m` và ngoài `safe_radius`, phát event `shade_spawned`. Khi `random_shades: false`: chỉ dùng danh sách scenario, hoạt động trạng thái `chase` ngay lập tức. |
| Đánh rơi đom đóm khi bị chạm | `hit_drop_ratio` là tỉ lệ rơi | `dropped = Math.floor(carried * hit_drop_ratio)` với `hit_drop_ratio = 0.5`. Đom đóm bị rơi tan biến vào sương mực (không thả ngay dưới chân để tránh tự nhặt lại ở tick kế tiếp). |
| Nạp ánh sáng vào đèn | "Nạp ánh sáng vào đèn để thắp đèn" | Nhấn `interact` (cạnh lên `false -> true`) trong `interact_radius` (`2.6m`) của đèn chưa sáng gần nhất sẽ nạp `min(carried, lantern_cost - deposited)`. Cho phép nạp nhiều lần; khi `deposited == lantern_cost` (`4`), đèn sáng (`lit: true`), cộng `100` điểm và tạo vùng an toàn `safe_radius = 5.5m`. |
| Vùng an toàn (`safe_radius`) | "Bóng Mực không vào được" | Chỉ áp dụng cho đèn đã sáng (`lit: true`). Bóng Mực bị chặn và trượt theo vành ngoài `safe_radius + 0.02m` (đảm bảo `distXZ > safe_radius`). Khi đèn vừa thắp hoặc Bóng Mực bị đẩy vào vùng an toàn, nó bị đẩy ra ngoài ngay. |
| Tỏa sáng (`pulse`) | "Tốn ánh sáng để xua Bóng Mực" | Yêu cầu `carried >= pulse_cost` (`1`) và hết hồi chiêu (`pulse_cooldown_s = 3s`). Mọi Bóng Mực trong `pulse_radius` (`7m`) bị đẩy xa thêm `pulse_push_m` (`6m`) theo tia từ Mây → Bóng Mực và chuyển sang `stunned` trong `pulse_stun_s` (`3s`). |
| Tên trường event `pulse` | Tài liệu ghi `{"stunnsed_ids": ["S1"]}` (nghi lỗi chính tả) | Sử dụng `stunned_ids` theo đúng chính tả tiếng Anh (nhất quán với trạng thái `stunned`); ghi nhận rõ để đối chiếu với trợ giảng/giảng viên. |
| Công thức tính điểm | "Có điểm số", `score.*` trong contract | `+10` mỗi đom đóm nhặt (`per_mote`), `+100` mỗi đèn thắp (`per_lantern`), `+25` mỗi Bóng Mực bị làm choáng (`per_stun`). Khi thắng (`all_lit`), cộng thưởng `Math.floor(time_left_s) * 5 + flames * 50`. Thua không cộng thưởng thời gian/máu còn lại. |
| Nhảy & vật lý dọc | "Nhân vật đi lại, nhảy" | `jump` kích hoạt cạnh lên khi chạm đất (`y = 0`), vận tốc bật `7.5 m/s`, trọng lực `20 m/s²`. Mọi khoảng cách contract vẫn đo theo mặt phẳng `XZ`. |

## 3. Tiêu chí nghiệm thu & Kế hoạch kiểm chứng (trước khi viết code)

| Mã | Yêu cầu chính | Tiêu chí kiểm chứng ("Làm A thì thấy B") | Cách kiểm chứng |
|---|---|---|---|
| AC-01 | Đồng bộ Contract | `game.contract.json` khớp 100% hằng số `tuning` trong code | Unit test `tuning.test.ts` |
| AC-02 | Di chuyển & xoay camera | Chạy `move: [0, 1]`, `cam_yaw_deg: 0` trong 120 tick → vị trí `(0, 0, 12)` đúng `player_speed = 6`; xoay `90°` di chuyển theo `+X` | Unit test + Scenario `S01_move_pickup` |
| AC-03 | Nhặt đom đóm & sức chứa | Đi qua đom đóm trong `<= 1.6m` → `carried` tăng, phát `mote_picked`, cộng `10` điểm; đạt `5` không nhặt thêm | Scenario `S01_move_pickup` |
| AC-04 | Nạp đèn & Thắng (`all_lit`) | Đứng trong `<= 2.6m` đèn, bấm `interact` → phát `deposit`, đủ 4 phát `lantern_lit`; đủ 5 đèn phát `game_over` (`won`/`all_lit`) và cộng điểm thưởng | Scenario `S02_light_and_win` |
| AC-05 | Bóng Mực đuổi, va chạm, bất tử & Thua (`no_flames`) | Bóng Mực đuổi chạm `<= 1.2m` → `player_hit` mất 1 máu, rơi 50% đom đóm, bất tử 90 tick; mất hết 3 máu → `game_over` (`lost`/`no_flames`) | Scenario `S03_shade_hit_and_lose` |
| AC-06 | Tỏa sáng (`pulse`) & Choáng | Bấm `pulse` khi `carried >= 1` và Bóng Mực `<= 7m` → trừ 1 ánh sáng, đẩy ra `6m`, trạng thái `stunned` 180 tick, phát event `pulse`, cộng `25` điểm | Scenario `S04_pulse_stun` |
| AC-07 | Vùng an toàn quanh đèn sáng | Mây đứng cạnh đèn đã sáng (`lit: true`), Bóng Mực tiến tới nhưng luôn giữ `distXZ > 5.5m` và không chạm được Mây | Scenario `S05_safe_radius` |
| AC-08 | Hết giờ (`dawn`) | Scenario `time_left_s: 2` chạy 180 tick → dừng đúng tick 120 với `game_over` (`lost`/`dawn`) | Scenario `S06_dawn_timeout` |
| AC-09 | Tính tất định & mã lỗi CLI | Chạy cùng `--seed`, scenario, inputs 2 lần → SHA-256 giống hệt; file inputs/scenario lỗi → exit code `2` | Script `verify-contract.mjs` |
| AC-10 | Giao diện 3D, HUD & Chơi lại | Mở bản web thấy Mây (nón lá + đèn nhỏ), đảo 5 đèn sáng dần, đom đóm vàng cam, Bóng Mực tím đen, HUD đầy đủ, chơi lại được | Kiểm thử trình duyệt + ảnh chụp |
