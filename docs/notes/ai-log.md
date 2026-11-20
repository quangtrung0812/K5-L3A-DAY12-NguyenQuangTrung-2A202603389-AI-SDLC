# Nhật ký dùng AI & Quản lý Token

## Phase 1 — PRD-0 (Đêm 1: Đảo Bến + Test Contract v1.0)

### 1. Quy trình phối hợp với AI
- **Đọc hiểu & rà soát yêu cầu trước khi code:** Tách rõ phần bắt buộc (Test Contract v1.0, quy ước tick, hệ tọa độ XZ, mã thoát `2`) khỏi phần mơ hồ, ghi thành bảng giả định & 10 tiêu chí nghiệm thu (`AC-01` → `AC-10`) trong `docs/notes/phase-1-assumptions.md`.
- **Thiết kế kiến trúc tách lõi trước:** Dựng `src/sim/` thuần TypeScript (không phụ thuộc Three.js/DOM, dùng Mulberry32 PRNG có seed) và biên dịch riêng qua `tsconfig.headless.json` để đảm bảo headless không bao giờ kéo theo code đồ họa.
- **Lập harness sớm:** Tạo `AGENTS.md` ngắn gọn (~35 dòng), skill `.agents/skills/verify-phase/SKILL.md`, script tự kiểm chứng `scripts/verify-contract.mjs`, và GitHub Actions `.github/workflows/verify.yml`.

### 2. Lỗi / điểm rủi ro đã phát hiện & xử lý trong quá trình làm
1. **Lỗi chính tả nghi ngờ trong đặc tả contract (`stunnsed_ids`):** Phát hiện trong PRD-0 mục E event `pulse` ghi `{"stunnsed_ids": ["S1"]}` trong khi trạng thái Bóng Mực ghi `stunned`. Đã ghi rõ giả định dùng `stunned_ids` và đánh dấu cần đối chiếu trực tiếp với trợ giảng trên Lab Board.
2. **Nguy cơ nhặt lại đom đóm ngay sau khi bị Bóng Mực đánh rơi:** Nếu thả đom đóm rơi ngay tại vị trí chân Mây, tick kế tiếp sẽ lập tức nhặt lại do `distXZ = 0 <= pickup_radius`, làm sai kết quả test `player_hit`. Đã thiết kế đom đóm bị rơi tan biến vào sương mực để giữ đúng trạng thái `carried` và `dropped`.
3. **Rủi ro tường vô hình chặn kịch bản test ẩn:** Nếu khóa cứng vị trí người chơi ở bán kính đảo mặc định `38m`, test ẩn đặt đèn ở tọa độ xa hơn sẽ bị kẹt. Đã tính `playableRadius = Math.max(ISLAND_RADIUS - 0.5, maxEntityDist + 10)` khi dựng scenario.
4. **Rủi ro lệch hướng trái/phải của camera 3D trong Three.js:** Kiểm tra tích có hướng `fwd × up` trên hệ trục tay phải để ánh xạ chính xác phím `A`/`D` sang trục `X` của simulation (`-right`) khi camera nhìn dọc `+Z`.
5. **Khác biệt shell PowerShell 5.1 trên Windows (`&&`):** PowerShell 5.1 không hỗ trợ `&&`, nên giữ các script trong `package.json` chạy qua npm/cross-platform và dùng lệnh hợp lệ cho CI Linux (`ubuntu-latest`).
6. **6 edge case do subagent Reviewer độc lập phát hiện (`docs/proof/phase-1/review.md`):**
   - `playableRadius` vô tình mở rộng tới `~45m` ở chế độ chơi thường (cho phép Mây đi ra ngoài đảo `38m`).
   - Scenario khởi tạo ở trạng thái kết thúc sẵn (`all_lit`, `flames: 0`, `time_left_s: 0`, `deposited: 4`) và `time_left_s` số lẻ (`Math.round` vs `Math.ceil`).
   - Cờ `--scenario`/`--inputs` không có giá trị bị bỏ qua im lặng; `shades[].id` rỗng/trùng chưa bị chặn mã `2`.
   - Đã sửa toàn bộ và bổ sung unit test + contract check để khóa vĩnh viễn các lỗi này.

### 3. Đánh giá nhanh cuối Phase 1
- **Đạt:** Toàn bộ yêu cầu lõi PRD-0, Test Contract v1.0, chế độ headless, tính tất định, mã lỗi `2`, giao diện 3D + HUD + chơi lại + 3 sáng tạo client-only.
- **Cần theo dõi / cải thiện cho Phase 2:**
  - Xác nhận với trợ giảng trên Lab Board về key `stunned_ids` vs `stunnsed_ids` trong event `pulse`.
  - Mở rộng `AGENTS.md` và `verify-contract.mjs` ngay khi Phase 2 thêm thực thể/luật mới để tránh hồi quy.

### 4. Ước tính Token & Chiến lược tiết kiệm
- **Ước tính Phase 1:** ~18k–25k tokens đầu ra / ~60k–80k tokens ngữ cảnh tổng (1 phiên tập trung, không lặp vô ích).
- **Cách đã tiết kiệm token:**
  - Đọc toàn bộ tài liệu và chốt giả định/kiến trúc 1 lần trước khi sinh code thay vì sửa đi sửa lại.
  - Gộp tạo các module độc lập trong cùng lượt gọi công cụ (`src/sim/*`, `tests/scenarios/*`, `src/client/*`).
  - Giữ `AGENTS.md` cực ngắn (~35 dòng) để không phình ngữ cảnh ở các phase sau.
  - Dùng script `npm test` chạy kiểm chứng tự động một lệnh thay vì hỏi AI kiểm tra thủ công từng file JSONL.
