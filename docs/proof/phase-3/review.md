# Independent QA Review — Phase 3 (`TICKET-03 · Contract v1.2`)

- **Người rà soát:** Subagent `research` độc lập (`Phase 3 Contract v1.2 Reviewer`)
- **Phạm vi:** `Phase3.md`, `game.contract.json`, `src/sim/`, `src/headless/`, `src/client/`, `tests/`, `scripts/verify-contract.mjs`, `docs/notes/adr-001-lantern-fuel-and-dawn-win.md`, `CHANGELOG.md`.
- **Kết luận ban đầu:** Lõi mô phỏng, Contract v1.2 và chế độ headless đạt **0 lỗi chặn**; phát hiện **1 điểm Medium** (DoD regression test) và **4 điểm Minor** (UI/edge-case). Toàn bộ **5/5 điểm đã được khắc phục và kiểm chứng lại PASS**.

---

## Danh sách phát hiện & Khắc phục

| # | Mức độ | Phát hiện của QA Reviewer | Khắc phục đã áp dụng | Trạng thái |
|---|---|---|---|---|
| 1 | **Medium** | Khi gộp khối test Phase 2 trong `tests/sim.test.ts`, có 5 assertion hồi quy không bị thay thế bị rút gọn (thứ tự ID tự nhiên `S2 < S10`, `recoil` đúng `2.000m`, re-stun `+5` & reset `120t`, leo dốc & chặn Tháp Chuông Đêm 3, pulse Gió Lạc `chase → flee`). | Khôi phục đầy đủ toàn bộ 5 assertion trong bài test riêng của `tests/sim.test.ts` (không bỏ sót bất kỳ hồi quy nào của Phase 2). | **Đã sửa & PASS** |
| 2 | **Minor** | `.offscreen-arrow` dùng `display: flex` đè thuộc tính HTML `[hidden]`, có thể làm mũi tên hiện ngoài màn hình chơi. | Thêm quy tắc chuẩn `[hidden] { display: none !important; }` vào `src/client/style.css`. | **Đã sửa & PASS** |
| 3 | **Minor** | Trong chế độ mù màu (`body.colorblind`), `.hud-clock.danger` vẫn giữ `box-shadow` màu đỏ cứng; chuỗi gợi ý CLI (`cli.ts:77`) còn ghi `Contract v1.1` và nút menu chưa nhắc chế độ mù màu. | Thêm `body.colorblind .hud-clock.danger { box-shadow: 0 0 18px rgba(255,255,255,0.45); }`, cập nhật `cli.ts` lên `Contract v1.2` và cập nhật nhãn nút Cài đặt trong `index.html`. | **Đã sửa & PASS** |
| 4 | **Minor** | Trong kịch bản tùy chỉnh có 2 đèn cách nhau `< 6m`, Bóng Mực đang `drain` đèn kia khi bị đẩy ra (`safePushTicks > 0`) vẫn có thể tiếp tục hút dầu cho đến khi ra khỏi `2m`. | Chặn `shade.safePushTicks > 0` tại Bước 2 hút dầu và đặt lại `drain → wander` vô điều kiện trong `triggerSafeZonePushout` (`src/sim/engine.ts`). | **Đã sửa & PASS** |
| 5 | **Minor** | Bổ sung unit test cho các ca biên Phase 3 (tie-break ID khi tương tác, tie-break đèn yếu của `wander`, `chase` không đổi mục tiêu, ngưỡng bình minh Đêm 2 `4/6` & Đêm 3 `5/7`, đèn tắt ở đúng tick bình minh cuối) và hoàn thiện file `review.md`. | Đã thêm trọn bộ test biên trong `tests/sim.test.ts` (tổng `17/17` unit test PASS) và lưu hồ sơ này tại `docs/proof/phase-3/review.md`. | **Đã sửa & PASS** |

---

## Xác nhận cuối cùng
- Toàn bộ 8 nhóm yêu cầu trong `Phase3.md` (nhiên liệu `1/60` nguyên, châm dầu/tắt đèn/thắp lại, vùng an toàn `≥ 30` & `drain`, luật thắng `dawn_survived`, sức chứa động `10..20`, công thức điểm v1.2, chế độ mù màu `#00B3FF`/`#FFFFFF` + `⚠` + đèn tắt xẹp `20%`/vết rách + nhấp nháy `1 Hz`, và DoD ADR/Changelog/Regression) đều **PASS 100%**.
