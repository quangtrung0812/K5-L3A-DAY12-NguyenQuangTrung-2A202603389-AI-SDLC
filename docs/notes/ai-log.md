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

---

## Phase 2 — TICKET-02 ("Ba hòn đảo" · Chuẩn hóa số liệu · Test Contract v1.1)

### 1. Quy trình phối hợp với AI & Cập nhật Harness
- **Đối chiếu spec trước khi sửa code:** Lập bảng so sánh toàn bộ thay đổi từ Contract v1.0 → v1.1 (tốc độ, sức chứa 10, điểm tính khi nạp, rơi khỏi đảo `Y < -10`, 5 trạng thái Bóng Mực, thứ tự 12 bước) và viết 10 tiêu chí nghiệm thu (`AC-2.1` → `AC-2.10`) trong `docs/notes/phase-2-spec.md`.
- **Cập nhật Harness AI trước khi code:** Nâng cấp `AGENTS.md` và skill `.agents/skills/verify-phase/SKILL.md` phản ánh đúng kiến trúc `src/sim/maps.ts`, thứ tự 12 bước và benchmark 21.600 tick `≤ 30s`.
- **Tách địa hình chuẩn dùng chung (`src/sim/maps.ts`):** Toàn bộ hình học 3 hòn đảo (Đảo Bến, Đảo Cau + cầu tre + 2 bục nhảy, Đảo Chuông 3 tầng + 2 dốc 30°/150° + Tháp Chuông) định nghĩa 1 nguồn duy nhất cho cả headless và client 3D.

### 2. Lỗi đã phát hiện & xử lý trong Phase 2
1. **Lỗi kiểm tra thoát vòng lặp CLI khi `paused`:** Phát hiện kịp lúc thiết kế rằng ở Phase 1 CLI dừng khi `sim.state !== 'playing'`; nếu giữ nguyên thì trạng thái `paused` sẽ làm CLI thoát sớm. Đã đổi điều kiện dừng thành `sim.state === 'won' || sim.state === 'lost'`.
2. **Lỗi trong kịch bản benchmark 21.600 tick:** Lần chạy đầu gió Đêm 3 thổi Mây rơi khỏi tầng 2 nên chết sớm ở tick 4.352; đã điều chỉnh kịch bản benchmark dùng `flames: 999` để đo trọn vẹn 21.600 tick (**~264 ms** so với ngưỡng 30.000 ms).
3. **7 lỗi tinh vi do subagent Reviewer độc lập phát hiện (`docs/proof/phase-2/review.md`):**
   - Sắp xếp ID bằng `localeCompare` đặt `S10` trước `S2` (vi phạm thứ tự id tăng dần ở Đêm 3).
   - Off-by-one ở `recoil` (59 bước thay vì 60 bước = `2.0m`), Bùa Gió (599 tick thay vì 600 tick), và `drifter.fleeTicks` (giảm ở Step 8 thay vì Step 2).
   - Thiếu theo dõi `usedMoteIds` khi scenario đặt ID đom đóm tùy chỉnh, và `prevInput` không đồng bộ đủ nút khi đang `paused`.
   - Toàn bộ 7 phát hiện đã được sửa sạch và bổ sung unit test chống hồi quy.
4. **3 lỗi/trải nghiệm do học viên chơi thử thực tế phát hiện (`Note.md`):**
   - **Lỗi đứng hình sau Pause → Tiếp tục:** Trong `src/client/main.ts`, `togglePauseUi()` gửi `pause: true` lúc tạm dừng nhưng không gửi tick thả nút `pause: false` trước khi gửi `pause: true` lúc tiếp tục, khiến `sim.prevInput.pause` luôn là `true` và không kích hoạt cạnh lên để thoát `paused`. Đã sửa bằng cách thả nút ngay sau khi pause + đồng bộ `accumulator`/`lastFrameMs`, và thêm unit test cho chu kỳ pause/resume lặp lại.
   - **Camera phải giữ chuột:** Đổi từ kéo chuột sang xoay camera tự do theo chuyển động chuột (`pointermove` + Pointer Lock 360° khi nhấp màn hình, tự tạm dừng khi nhấn `Esc` mở khóa chuột).
   - **Bản đồ quá tối khi chưa thắp đèn:** Bổ sung ánh trăng bạc xanh (`DirectionalLight` + `HemisphereLight` nhẹ + quầng trăng) giúp nhìn rõ địa hình trong đêm tối mà vẫn giữ nguyên `AmbientLight = 0.15 + 0.55 * (lit / total)`.
   - **Nâng cấp tạo hình Chibi Người Giữ Đèn & đa dạng hóa mob 3D (client-only):** Dựng lại Mây 100% thủ tục theo dáng chibi tóc vàng bện bím búi lệch, băng đô bèo kem (`#E8E2D0`), kính tròn viền vàng (`#F2C14E`) có dây xích, mắt xanh lục, nơ đỏ (`#C8102E`), váy bèo và gậy đèn lồng treo đèn ấm (đảm bảo bản gốc & không bạo lực theo `RULES.md` + `PRD-0`), kết hợp 4 archetype Bóng Mực + 2 archetype Gió Lạc + đom đóm vỗ cánh. Giữ nguyên `player_speed = 6.0 m/s` để không vi phạm Contract v1.1, tăng cảm giác tốc độ bằng FOV động (`54°→67°`), bước chạy nảy và bụi chân.

### 3. Đánh giá nhanh cuối Phase 2
- **Đạt:** Toàn bộ số liệu chuẩn, 3 Đêm hoàn chỉnh, Contract v1.1, regression Phase 1 (6/6), tính năng mới Phase 2 (6/6), tất định 3 Đêm, benchmark 21.600 tick (~0.26s), giao diện 3D + bảng màu chuẩn + chiến dịch 3 Đêm + Pause + Settings + nhạc nền & 10+ SFX + HUD chuẩn.
- **Lưu ý:** Cần kiểm tra trực quan FPS (≥ 30 FPS ở 1280×720) trên trình duyệt thật vì Chrome remote debugging chưa bật trong môi trường chạy lệnh.
- **Cập nhật tạo hình client-only (không đổi headless):** Tạo hình nhân vật chính Mây phong cách Chibi Kiếm Sĩ Nón Trắng (Scarlet) với nón lá cơ khí trắng viền đỏ, hai tấm giáp vành, áo haori trắng lót đỏ, giáp vai samurai xếp tầng, dây thừng obi đỏ, thanh kiếm chuôi trắng và đèn lồng mini đeo hông; giữ nguyên toàn bộ quái Bóng Mực spawn tạo hình chibi **Doro** 4 chân trắng tóc hồng búi hoa hồng + nơ tím/trắng kèm đủ 5 trạng thái (`spawning`, `wander`, `chase`, `recoil`, `stunned`) và cuộn chuột zoom mượt (`2.6m–24m`).

### 4. Ước tính Token & Chiến lược tiết kiệm Phase 2
- **Ước tính Phase 2:** ~28k–36k tokens đầu ra / ~95k–120k tokens ngữ cảnh tổng (triển khai toàn bộ 3 bản đồ, 6 hệ thống mới, UI/audio 3D, 16 unit test, 15 contract check và review độc lập).
- **Cách tiết kiệm token:**
  - Gom toàn bộ chỉnh sửa theo 4 batch song song (Specs/Harness → Sim/Headless → 3D Client → Tests/Scenarios) thay vì sửa từng file lẻ tẻ.
  - Để subagent `research` độc lập rà soát 1 lần trọn gói rồi áp dụng tất cả 7 fix trong đúng 1 lượt song song.
