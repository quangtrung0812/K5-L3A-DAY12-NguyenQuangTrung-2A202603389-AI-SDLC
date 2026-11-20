---
name: verify-phase
description: Quy trình tự kiểm chứng chuẩn trước khi gắn tag phase: chạy unit test, contract headless, kiểm tra tính tất định, build web 3D, và xuất báo cáo bằng chứng khớp mã.
---

# Skill: Verify Phase (`verify-phase`)

Kích hoạt kỹ năng này trước mỗi lần chốt phase hoặc sau mọi thay đổi lớn vào `src/sim/` hay `src/headless/`.

## Các bước bắt buộc
1. **Typecheck & Build:** Chạy `npm run typecheck && npm run build` để đảm bảo cả bản headless (`dist/headless/`) và web 3D (`dist/web/`) biên dịch sạch, không lỗi TypeScript.
2. **Unit Tests:** Chạy `npm run test:unit` để kiểm tra đồng bộ `game.contract.json` ↔ `src/sim/tuning.ts`, toán xoay hướng di chuyển, nhặt đom đóm, nạp đèn, pulse, safe radius, va chạm Bóng Mực, điều kiện thắng/thua.
3. **Contract Scenarios & Determinism:** Chạy `npm run verify:contract` để:
   - Chạy toàn bộ kịch bản headless trong `tests/scenarios/`.
   - Kiểm tra định dạng JSONL (snapshot, event, end, làm tròn 3 chữ số thập phân).
   - Chạy lặp 2 lần cùng `--seed`, `scenario`, `inputs` và xác nhận SHA-256 giống nhau 100%.
   - Kiểm tra mã thoát `2` với file `inputs`/`scenario` lỗi định dạng.
   - Ghi báo cáo kết quả tự động vào `docs/proof/phase-1/contract-report.md`.
4. **Kiểm chứng giao diện 3D:** Mở bản web build (`npm run preview`) trên trình duyệt, xác nhận hiển thị Mây, 5 Đèn Lồng Lớn, đom đóm, Bóng Mực, HUD, tương tác thắng/thua/chơi lại và chụp ảnh bằng chứng vào `docs/proof/phase-1/`.
5. **Đối chiếu truy vết:** Cập nhật bảng truy vết yêu cầu → bằng chứng trong `docs/proof/phase-1/README.md`, ghi trung thực mọi mục chưa đạt nếu có.
