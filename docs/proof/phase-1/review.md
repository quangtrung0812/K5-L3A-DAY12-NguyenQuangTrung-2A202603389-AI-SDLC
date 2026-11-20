# Phase 1 — Báo cáo Review Độc lập (Independent QA Agent)

Đánh giá do subagent `research` độc lập (không viết mã nguồn) thực hiện đối chiếu toàn bộ `src/sim/`, `src/headless/`, `game.contract.json` và bộ test với Test Contract v1.0.

## Các lỗi / edge case được reviewer phát hiện & cách xử lý

| # | Mức độ | Phát hiện của Reviewer độc lập | Khắc phục đã áp dụng |
|---|---|---|---|
| 1 | Medium | `playableRadius` mở rộng theo `maxDist + 10` cả khi chơi bình thường (không có scenario) làm nhân vật đi quá mép đảo hiển thị `38m` | Chỉ mở rộng `playableRadius` khi có `scenario`; chơi thường khóa chặt tại `37.5m` (`src/sim/engine.ts`) + thêm unit test |
| 2 | Medium | Scenario khởi tạo ở trạng thái kết thúc sẵn (5 đèn đã `lit: true`, `flames: 0`, `time_left_s: 0`, hoặc `deposited: 4` mà không ghi `lit`) không kết thúc đúng hoặc không thắp được đèn | Tự đặt `lit = true` nếu `deposited >= lantern_cost` khi dựng; thêm guard kết thúc hợp lệ ở đầu `step()` (vẫn giữ tick 0 không phát event) + thêm unit test |
| 3 | Medium | `Math.round(time_left_s * 60)` có thể kết thúc `dawn` sớm 1 tick khi `time_left_s` là số lẻ như `2.02` | Đổi sang `Math.ceil(initialTimeLeftS * TICK_RATE - 1e-9)` + thêm unit test kiểm chứng |
| 4 | Medium | Thiếu giá trị sau cờ `--scenario` hoặc `--inputs` bị bỏ qua im lặng | Thêm `requireStrArg()` ném lỗi và thoát mã khác 0 + thêm kiểm tra trong `verify-contract.mjs` |
| 5 | Low | `scenario.shades[].id` rỗng hoặc trùng nhau chưa bị chặn | Validate chuỗi không rỗng & không trùng ID trong `src/headless/validation.ts` (thoát mã `2`) + thêm unit test |
| 6 | Low | Chưa có test phủ `shade_spawned` (tick 2100), `pulse` nhiều Bóng Mực và JSON sai cú pháp | Đã bổ sung đầy đủ vào `tests/sim.test.ts` và `scripts/verify-contract.mjs` |
| 7 | Risk | Tài liệu PRD-0 dòng 158 ghi `stunnsed_ids` (nghi lỗi chính tả) trong khi dòng 164 ghi `stunned` | Giữ `stunned_ids` và đánh dấu rõ để xác nhận trực tiếp với trợ giảng trên Lab Board |
