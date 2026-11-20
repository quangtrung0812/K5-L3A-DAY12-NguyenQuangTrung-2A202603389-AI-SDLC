---
name: verify-phase
description: Quy trình tự kiểm chứng chuẩn trước khi gắn tag phase (hỗ trợ Contract v1.2, Đèn cạn dầu, Bóng Mực drain, luật thắng bình minh, regression Phase 1–2 và benchmark Đêm 3).
---

# Skill: Verify Phase (`verify-phase`)

Kích hoạt kỹ năng này trước mỗi lần chốt phase hoặc sau mọi thay đổi lớn vào `src/sim/`, `src/headless/` hay `src/client/`.

## Các bước bắt buộc
1. **Typecheck & Build:** Chạy `npm run typecheck && npm run build` để đảm bảo cả bản headless (`dist/headless/`) và web 3D (`dist/web/`) biên dịch sạch, không lỗi TypeScript.
2. **Unit Tests & Regression:** Chạy `npm run test:unit` để kiểm tra:
   - Đồng bộ `game.contract.json` ↔ `src/sim/tuning.ts` (`contract_version: "1.2"`).
   - Toàn bộ luật không bị thay thế từ Phase 1–2 (di chuyển, nhảy, lướt, nhặt, pulse 3D, vùng an toàn đẩy ra trong 30 tick, rơi khỏi đảo `Y < -10`, 3 bản đồ chuẩn, Gió Lạc, Bùa Gió, Tạm dừng).
   - Toàn bộ luật thay thế & mới của Phase 3: nhiên liệu đơn vị nguyên `1/60`, châm dầu (`refuel`), tắt đèn (`lantern_out`), thắp lại tốn `5` (`relight: true`, `+40`), mất vùng an toàn khi `fuel < 30`, Bóng Mực `drain` (`5/s`, `fuel_drain` mỗi `60` tick, pulse `+15`), châm lên `≥ 30` đẩy ra 30 tick, sức chứa động `10 + 2×successful_lights` tối đa `20`, luật thắng `dawn_survived` (`≥ ceil(0.6×N)`) và bảng điểm v1.2.
3. **Contract v1.2 Scenarios, Determinism & Benchmark:** Chạy `npm run verify:contract` để:
   - Chạy toàn bộ kịch bản regression Phase 1–2 không bị thay thế và bộ kịch bản đầy đủ cho Phase 3 trong `tests/scenarios/`.
   - Xác thực cấu trúc JSONL v1.2 (`fuel`, `ever_lit`, `relit_count`, `capacity`, 6 trạng thái Bóng Mực gồm `drain`, sự kiện `refuel`/`lantern_out`/`fuel_drain`/`lantern_lit.relight`/`dawn_survived`).
   - Kiểm tra tính tất định (SHA-256 giống hệt giữa 2 lần chạy cùng `--seed` trên cả Đêm 1, 2, 3).
   - Kiểm tra mã thoát `2` với file `inputs`/`scenario` sai định dạng.
   - Đo thời gian chạy headless 1 Đêm 3 đầy đủ (`18.000` tick = `300s`) đảm bảo `≤ 30s`.
   - Xuất báo cáo tự động vào `docs/proof/phase-3/contract-report.md`.
4. **Đánh giá độc lập (Independent QA Review):** Khởi chạy subagent `research` độc lập rà soát thay đổi so với đặc tả Contract v1.2 và ghi kết quả vào `docs/proof/phase-3/review.md`.
5. **Đối chiếu truy vết & DoD:** Xác nhận có ADR ([`docs/notes/adr-001-lantern-fuel-and-dawn-win.md`](docs/notes/adr-001-lantern-fuel-and-dawn-win.md)), [`CHANGELOG.md`](CHANGELOG.md), cập nhật test cũ có lý do (không skip âm thầm), [`docs/proof/phase-3/README.md`](docs/proof/phase-3/README.md), [`docs/notes/ai-log.md`](docs/notes/ai-log.md), và [`README.md`](README.md).
