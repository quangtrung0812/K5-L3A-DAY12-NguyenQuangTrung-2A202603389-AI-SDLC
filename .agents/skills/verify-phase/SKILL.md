---
name: verify-phase
description: Quy trình tự kiểm chứng chuẩn trước khi gắn tag phase (hỗ trợ Contract v1.1, 3 Đêm, regression Phase 1 và benchmark 21.600 tick).
---

# Skill: Verify Phase (`verify-phase`)

Kích hoạt kỹ năng này trước mỗi lần chốt phase hoặc sau mọi thay đổi lớn vào `src/sim/`, `src/headless/` hay `src/client/`.

## Các bước bắt buộc
1. **Typecheck & Build:** Chạy `npm run typecheck && npm run build` để đảm bảo cả bản headless (`dist/headless/`) và web 3D (`dist/web/`) biên dịch sạch, không lỗi TypeScript.
2. **Unit Tests & Regression:** Chạy `npm run test:unit` để kiểm tra:
   - Đồng bộ `game.contract.json` ↔ `src/sim/tuning.ts` (`contract_version: "1.1"`).
   - Toàn bộ luật chuẩn hóa (di chuyển, nhảy 7.0 m/s, lướt 14 m/s, nhặt 3D/XZ, nạp 10 đom đóm, pulse 3D + knockback 15 tick, 5 trạng thái Bóng Mực, vùng an toàn đẩy ra trong 30 tick, rơi khỏi đảo `Y < -10` + hồi sinh 60 tick).
   - Bản đồ 3 Đêm (Đảo Bến, Đảo Cau + cầu tre + bục nhảy, Đảo Chuông + 3 tầng + 2 dốc + bục nhảy + tháp chuông + gió mạnh).
   - Tính năng mới: Gió Lạc (idle/chase/flee, cướp, thả khi trúng pulse), Bùa Gió (600 tick, tốc độ 7.2 m/s, lướt không hồi chiêu, tái sinh 2700 tick), Tạm dừng (`paused`/`resumed`).
3. **Contract v1.1 Scenarios, Determinism & Benchmark:** Chạy `npm run verify:contract` để:
   - Chạy toàn bộ kịch bản regression Phase 1 (theo số chuẩn) và ít nhất 1 kịch bản cho mỗi tính năng mới Phase 2 trong `tests/scenarios/`.
   - Xác thực cấu trúc JSONL v1.1 (`night`, `wind`, `player.*`, `motes`, `drifters`, `charms`, 5 tên trạng thái Bóng Mực).
   - Kiểm tra tính tất định (SHA-256 giống hệt giữa 2 lần chạy cùng `--seed` trên cả Đêm 1, 2, 3).
   - Kiểm tra mã thoát `2` với file `inputs`/`scenario` sai định dạng.
   - Đo thời gian chạy headless 1 Đêm đầy đủ (21.600 tick Đêm 3) đảm bảo `≤ 30s`.
   - Xuất báo cáo tự động vào `docs/proof/phase-2/contract-report.md`.
4. **Đánh giá độc lập (Independent QA Review):** Khởi chạy subagent `research` độc lập rà soát thay đổi so với đặc tả Contract v1.1 và ghi kết quả vào `docs/proof/phase-2/review.md`.
5. **Đối chiếu truy vết & DoD:** Cập nhật `docs/proof/phase-2/README.md`, `docs/notes/ai-log.md`, và `README.md`; xác nhận mọi mục DoD đều có bằng chứng thật.
