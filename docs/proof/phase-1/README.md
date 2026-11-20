# Phase 1 — Bảng Truy vết Yêu cầu & Bằng chứng Kiểm chứng

Lệnh chạy lại toàn bộ kiểm chứng tự động ở tag `phase-1`:

```bash
npm install && npm run build && npm test
```

## Bảng truy vết (Requirements → Verification → Evidence → Result)

| Mã | Yêu cầu PRD-0 / Contract v1.0 | Cách kiểm chứng | Bằng chứng | Kết quả |
|---|---|---|---|---|
| AC-01 | `game.contract.json` khớp 100% hằng số `tuning` trong code | Unit test đọc trực tiếp `game.contract.json` và so sánh sâu với `TUNING` | `tests/sim.test.ts` (`keeps src/sim/tuning.ts 100% synchronized`) | **Đạt** |
| AC-02 | Di chuyển XZ đúng tốc độ, xoay `cam_yaw_deg`, chuẩn hóa vector chéo, nhảy cạnh lên | Unit test + Headless scenario `S01` | [`contract-report.md`](contract-report.md) (`S01`: `pos=[6,0,12]`), `tests/sim.test.ts` | **Đạt** |
| AC-03 | Nhặt đom đóm (`<= 1.6m`), giới hạn sức chứa (`5`), cộng `+10` điểm | Unit test + Headless scenario `S01` | [`contract-report.md`](contract-report.md) (`S01`: `carried=5/5, motes_left=1, score=50`) | **Đạt** |
| AC-04 | Nạp ánh sáng vào đèn (`<= 2.6m`), nạp nhiều lần, thắp đủ 5 đèn → thắng (`all_lit`) + điểm thưởng | Unit test + Headless scenario `S02` | [`contract-report.md`](contract-report.md) (`S02`: `won at tick=101, score=860`) | **Đạt** |
| AC-05 | Bóng Mực đuổi, va chạm (`<= 1.2m`), mất máu, rơi 50% đom đóm, bất tử `1.5s`, thua (`no_flames`) | Unit test + Headless scenario `S03` | [`contract-report.md`](contract-report.md) (`S03`: `hits at ticks 26 & 116, gap=90, lost(no_flames)`) | **Đạt** |
| AC-06 | Tỏa sáng (`pulse`): tốn 1 đom đóm, đẩy `6m`, choáng `3s` (`180` tick), hồi chiêu `3s`, cộng `+25` | Unit test (đơn & nhiều Bóng Mực) + Headless scenario `S04` | [`contract-report.md`](contract-report.md) (`S04`: `pulse@tick=6, shade x=10.65m, recovered@tick=200`) | **Đạt** |
| AC-07 | Vùng an toàn `safe_radius = 5.5m` quanh đèn đã sáng ngăn Bóng Mực xâm nhập | Unit test + Headless scenario `S05` | [`contract-report.md`](contract-report.md) (`S05`: `minDist=5.520m > 5.5m, hits=0`) | **Đạt** |
| AC-08 | Hết giờ Đêm 1 → thua (`dawn`) đúng tick | Unit test (kể cả `time_left_s` lẻ) + Headless scenario `S06` | [`contract-report.md`](contract-report.md) (`S06`: `lost(dawn) at exact tick=120`) | **Đạt** |
| AC-09 | Tính tất định 100% cùng `--seed` & mã thoát `2` khi inputs/scenario sai định dạng | Chạy 2 lần `seed=1337` so SHA-256; chạy 3 case lỗi định dạng + 1 case thiếu tham số | [`contract-report.md`](contract-report.md) (`DET` & `ERR`) | **Đạt** |
| AC-10 | Bản web 3D (Mây đội nón lá treo đèn, 5 đèn sáng dần, đom đóm, Bóng Mực, HUD, chơi lại) | Build production Vite (`npm run build:web`), khởi chạy `npm run preview` (`http://localhost:4173/`) | `dist/web/` biên dịch sạch (0 lỗi TS/Vite); *chưa có ảnh chụp màn hình tự động vì Chrome remote debugging chưa bật — học viên mở trình duyệt chụp bổ sung khi kiểm tra tay* | **Đạt (cần bổ sung ảnh chụp tay)** |
| QA-01 | Đánh giá độc lập bởi agent khác người viết | Subagent `research` rà soát toàn bộ mã so với PRD-0 và Contract v1.0 | [`review.md`](review.md) — phát hiện 6 edge case và đã sửa + bổ sung test | **Đạt** |
