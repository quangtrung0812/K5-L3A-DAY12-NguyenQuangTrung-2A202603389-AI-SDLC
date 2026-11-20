# Phase 2 — Báo cáo Review Độc lập (Independent QA Agent · Contract v1.1)

Đánh giá do subagent `research` độc lập (không viết mã nguồn) thực hiện đối chiếu toàn bộ `src/sim/`, `src/headless/`, `game.contract.json`, `tests/` và `docs/notes/phase-2-spec.md` với **TICKET-02 & Test Contract v1.1**.

## Các lỗi / off-by-one / edge case được reviewer phát hiện & cách xử lý

| # | Mức độ | Phát hiện của Reviewer độc lập | Khắc phục đã áp dụng |
|---|---|---|---|
| 1 | Medium | `a.id.localeCompare(b.id)` sắp xếp từ điển đặt `S10` trước `S2` (và phụ thuộc locale OS), sai quy tắc xét theo `id` tăng dần ở Đêm 3 (tối đa 10 Bóng Mực) | Thêm bộ so sánh số tự nhiên `compareEntityId(a, b)` (`S2 < S10`, `D2 < D10`, `L2 < L10`) độc lập locale + thêm unit test |
| 2 | Medium | Bóng Mực trạng thái `recoil` chỉ lùi `59` bước (`1.967m`) thay vì `60` bước (`2.000m`) do Step 2 thoát trạng thái trước bước lùi thứ 60 | Chuyển bước kết thúc `recoil` về cuối nhánh `recoil` ở Step 8 → lùi chuẩn `2.000m` trong đúng `60` tick + thêm unit test |
| 3 | Medium | Bùa Gió (`600` tick) chỉ tăng tốc/bỏ hồi chiêu `599` tick vì Step 2 trừ về `0` trước Step 3 | Lưu `charmActiveThisTick` trước khi giảm counter ở Step 2 → hưởng hiệu lực đủ `600` tick + thêm unit test |
| 4 | Low-Med | `drifter.fleeTicks` trừ trong Step 8 làm Gió Lạc bị Tỏa Sáng biến mất sớm 1 tick (`T+119`/`T+239` thay vì `T+120`/`T+240`) | Chuyển đếm ngược `drifter.fleeTicks` lên Step 2 đúng thứ tự 12 bước |
| 5 | Low-Med | `scenario.motes[].id` tùy chỉnh chưa được theo dõi nên có thể trùng ID với đom đóm mới sinh/rơi | Thêm `usedMoteIds` trong `LanternIslandSim` và chặn trùng ID trong `validation.ts` (exit `2`) + thêm unit test |
| 6 | Low-Med | `prevInput` không đồng bộ đủ nút khi đang `paused`, có thể làm rớt hoặc kích hoạt giả cạnh lên lúc `resumed` | Đồng bộ toàn bộ `prevInput` qua `syncPrevInput()` ở cả tick tạm dừng |
| 7 | Low | `drifter_drop` phát trước `pulse` cùng tick; thiếu test re-stun, win-on-timeout-tick và lệch mô tả `Y` của Gió Lạc trong spec | Đảo thứ tự phát `pulse` trước `drifter_drop`; bổ sung đầy đủ unit test và đồng bộ `docs/notes/phase-2-spec.md` |
