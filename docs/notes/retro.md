# Retrospective Dự án — Đảo Đèn Lồng (Day 12 AI SDLC · Phase 1 → Phase 4)

- **Tác giả:** Nguyễn Quang Trung (`2A202603389`)
- **Phiên bản phát hành:** `v1.0.0` (Tags: `phase-1`, `phase-2`, `phase-3`, `phase-4`)
- **Ngăn xếp công nghệ:** TypeScript + Three.js + Vite + Vitest + Node.js Headless CLI

---

## 1. Tổng hợp Đánh giá (Evaluation) qua 4 Phase

| Phase | Mục tiêu & Contract | Đạt được | Hồi quy phase trước | Điểm cần chỉnh / Bài học chính |
|---|---|---|---|---|
| **Phase 1** (`PRD-0`, v1.0) | Đêm 1 chơi được + tách lõi `src/sim/` thuần TS + CLI headless JSONL tất định | Đạt 100%: 11 unit test, 6 kịch bản contract, SHA-256 tất định, 3D Đảo Bến + Web Audio | N/A | Bắt được 6 lỗi biên qua subagent QA (bán kính đảo trong scenario, làm tròn `time_left_s`, ID trùng) trước khi gắn tag |
| **Phase 2** (`TICKET-02`, v1.1) | Chuẩn hóa số liệu + mở rộng 3 Đêm (*Đảo Bến, Đảo Cau, Đảo Chuông*), Dash, Bùa Gió, Gió Lạc, Gió mạnh, Pause | Đạt 100%: 16 unit test, 15 kịch bản contract, benchmark 21.600 tick `~280 ms` | 6/6 regression Phase 1 PASS | Sửa 7 lỗi tinh tế từ QA review (ID tự nhiên `S2 < S10`, `recoil` đủ 60 bước `2.000 m`, `charm` đủ 600 tick) và 3 lỗi từ playtest thật (`Pause → Resume`, ánh sáng trăng, chuột xoay tự do) |
| **Phase 3** (`TICKET-03`, v1.2) | Change Request *"Đèn cạn dầu"*: dầu nguyên `1/60`, châm dầu, `lantern_out`, thắp lại `5`, Bóng Mực `drain`, luật thắng `dawn_survived`, sức chứa `10..20`, chế độ mù màu | Đạt 100%: 17 unit test, 21 kiểm tra contract, ADR-001, Changelog, benchmark 18.000 tick `~480 ms` | 12/12 regression Phase 1–2 PASS (cập nhật minh bạch `R02` theo ADR-001) | QA review bắt kịp 5 assertion Phase 2 bị rút gọn khi gộp test và lỗi CSS `[hidden]` bị `display: flex` đè |
| **Phase 4** (`TICKET-04`, v1.3) | Phát hành `v1.0.0`: Benchmark `1280×720` VSync-off (`bench.json`), Soak 10 Đêm (`soak.json`), Bảng xếp hạng cục bộ + CLI export, Trợ năng đầy đủ (đổi phím, phụ đề + mũi tên Bóng Mực, giảm chuyển động, `≥ 18px` + `×1.25`), đóng gói & hồ sơ | Đạt 100%: 19 unit test, 23 kiểm tra contract + soak + leaderboard; `bench.json` đo thật **`152.3` avg / `54.8` p1_low / `2203 ms` load**; `soak.json` **`0` crash, `49.4 → 55.2 MB` (`1.12×`), `0.32 s`** | 100% test Phase 1–3 còn hiệu lực PASS | Tối ưu 3 vòng (gỡ WMI polling trong lúc đo, cache shadow map tĩnh trong `benchMode`, bỏ cấp phát mỗi khung) kéo `p1_low_fps` từ `15.6 → 29.6 → 54.8 FPS` trên Intel UHD Graphics |

---

## 2. Điều gì Hiệu quả & Không hiệu quả khi làm việc với AI

### Hiệu quả rõ rệt
1. **Tách kiến trúc ngay từ Phase 1 (`src/sim/` thuần TypeScript, 0 phụ thuộc DOM/Three.js):** Giúp mọi tính năng mới (3 bản đồ, Bùa Gió, nhiên liệu `1/60`, Soak 10 Đêm, Bench 200 Bóng Mực) phát triển và kiểm chứng trong dưới `1 giây` bằng `vitest` + headless CLI.
2. **Dùng subagent `research` độc lập để rà soát (Independent QA Review):** Ở cả 4 phase, một agent khác đọc lại toàn bộ spec và diff mã nguồn đã phát hiện đúng những lỗi biên mà agent viết code dễ bỏ qua (lỗi 1 tick ở `recoil`, `localeCompare` sai với `S10 < S2`, CSS `[hidden]`, biến rút gọn test cũ).
3. **Biểu diễn số nguyên cho mọi bộ đếm quan trọng:** Dùng tick nguyên (`60 Hz`) và nhiên liệu nguyên đơn vị `1/60` (`0..6000`) giúp SHA-256 tất định tuyệt đối trên Windows/Linux/macOS và tránh hoàn toàn sai số `Math.ceil((100 - fuel) / 10)`.
4. **Gom chỉnh sửa theo lô song song (batching):** Tách rõ Spec/Harness → Sim → Client → Tests giúp giảm số vòng lặp sửa lỗi và giữ ngữ cảnh gọn.

### Chưa hiệu quả / Khó khăn gặp phải
1. **Kiểm tra trực quan 3D trên trình duyệt qua MCP:** Do Chrome remote debugging chưa mở sẵn trên máy cục bộ, agent không tự chụp/nhìn trực tiếp khung hình 3D khi chỉnh tạo hình nhân vật, dẫn tới 2 lỗi hình học (vạt áo đuôi én bị lật ngược trong `sync()` và đối xứng trái/phải trục `±X`) phải phát hiện bằng đọc mã toán học và phản hồi playtest của người dùng.
2. **File `.gitignore` không neo gốc trên Windows:** Mẫu `Phase*.md` (không có dấu `/`) đã vô tình ẩn cả `docs/notes/phase-1-assumptions.md` và `docs/notes/phase-2-spec.md` vì Git Windows không phân biệt hoa/thường; chỉ phát hiện khi rà soát trước lúc commit Phase 2.
3. **Nhu cầu trải nghiệm chơi so với ràng buộc Contract tự động:** Khi playtest, người chơi muốn tăng tốc chạy và tăng tầm hút đom đóm, nhưng đổi hằng số `player_speed = 6` hoặc `pickup_radius = 1` trong `src/sim/` sẽ làm hỏng test ẩn của giảng viên. Giải pháp đúng là giữ tuyệt đối số liệu trong `src/sim/` và cải thiện cảm giác ở tầng client (`FOV`, bụi chân, đom đóm nghiêng hút trực quan).

---

## 3. Những lần AI sai, Cách phát hiện & Điều chỉnh Harness

| Lỗi của AI | Cách phát hiện | Đã chỉnh gì trong Harness / Quy trình |
|---|---|---|
| `a.id.localeCompare(b.id)` xếp `S10` trước `S2`; `recoil` đi thiếu 1 tick (`59/60`); `charm` chỉ hiệu lực `599/600` tick | Independent QA subagent đối chiếu `src/sim/engine.ts` với `Phase2.md` | Thêm quy tắc kiểm tra độc lập bằng subagent `research` vào skill `.agents/skills/verify-phase/SKILL.md` |
| Nhấn `Esc/P` Tạm dừng rồi bấm "Tiếp tục" làm nhân vật đứng im (do gửi `pause: true` 2 lần liền mà không có tick nhả `pause: false`) | Playtest thật của tác giả (`Note.md`) | Bổ sung unit test vòng lặp `Pause → Release → Resume → Dash` vào `tests/sim.test.ts` |
| Khi gộp khối test Phase 2 ở Phase 3 đã vô tình bỏ bớt 5 assertion hồi quy không bị thay thế | Independent QA subagent so sánh `git diff` với tag `phase-2` | Bổ sung điều cấm *"KHÔNG rút gọn hay skip test cũ âm thầm"* vào `AGENTS.md` |
| `.offscreen-arrow { display: flex }` đè thuộc tính HTML `[hidden]` | Independent QA subagent kiểm tra `style.css` | Thêm quy tắc toàn cục `[hidden] { display: none !important; }` |
| Kịch bản `P3-03` để Mây đi bộ từ xa khiến Bóng Mực chuyển `drain → chase` ở `6 m` trước khi kịp bấm `Pulse` ở `5 m` | Chạy thật `npm run verify:contract` báo FAIL điểm `40` | Tách rõ kịch bản `P3-03` (`wander → drain → aggro 6m`) và `P3-04` (`pulse` trúng `drain` `+15` điểm) |
| `scripts/bench.mjs` gọi `PowerShell + Get-CimInstance` mỗi `1.5s` làm `p1_low_fps` tụt còn `15.6 FPS` dù `avg_fps = 103.4 FPS` | Chạy benchmark thực tế 30 giây trên Chrome (`bench.json`) | Dời lấy mẫu RSS sang pha warmup + hậu đo, cache shadow map tĩnh và bỏ cấp phát trong `syncBench` → kéo `p1_low_fps` lên **`54.8 FPS`** |

---

## 4. Thành phần Harness AI hữu ích nhất

1. **`scripts/verify-contract.mjs` + `npm test` (tích hợp trong `.githooks/pre-push` và `.github/workflows/verify.yml`):** Hữu ích nhất — chạy toàn bộ typecheck, build headless, unit test, regression, kịch bản từng phase, tất định SHA-256, soak test và benchmark trong ~2 giây; chặn tuyệt đối việc tuyên bố hoàn thành khi còn lỗi.
2. **`AGENTS.md` (cập nhật qua từng Phase 1 → 4):** Giữ vững đường biên kiến trúc (`src/sim/` thuần TS, không sửa hằng số chuẩn, nhiên liệu nguyên `1/60`, thứ tự 12 bước/tick) khiến AI không bao giờ phá vỡ tính tất định hay nhập nhằng giữa client và headless.
3. **Skill `.agents/skills/verify-phase/SKILL.md`:** Chuẩn hóa quy trình 5 bước trước khi gắn tag (build → unit test → contract/soak → independent QA review → cập nhật DoD).

---

## 5. Tổng hợp Token / Chi phí AI ước tính & Cách tiết kiệm

| Phase | Ước tính Output Tokens | Ước tính Context Tokens | Chi phí ước tính (tương đương) | Ghi chú |
|---|---:|---:|---:|---|
| Phase 1 | ~18k–24k | ~55k–70k | ~\$0.45 | Dựng khung kiến trúc, sim Đêm 1, client 3D, harness & QA |
| Phase 2 | ~28k–36k | ~95k–120k | ~\$0.85 | 3 bản đồ, 6 hệ thống mới, playtest fix + tùy biến tạo hình 3D |
| Phase 3 | ~18k–24k | ~65k–85k | ~\$0.55 | Change Request v1.2, ADR-001, Changelog, chế độ mù màu & QA |
| Phase 4 | ~20k–26k | ~70k–90k | ~\$0.65 | Bench CLI, Soak test, Leaderboard cục bộ, Accessibility, Release & Retro |
| **Tổng cộng** | **~84k–110k** | **~285k–365k** | **~\$2.50** | Gọn, không đốt token vào retry mù hay đồ họa thừa |

**Cách tiết kiệm token hiệu quả:**
- Đọc toàn bộ đề bài và lên thiết kế/ADR trước khi code; gộp chỉnh sửa độc lập vào 3–4 batch song song mỗi phase thay vì sửa lắt nhắt từng file.
- Dùng `npm test` chạy trong ~2s làm vòng phản hồi tự động thay vì nhờ AI đọc đi đọc lại log dài.
- Dùng subagent `research` chỉ 1 lần cuối mỗi phase để gom toàn bộ lỗi biên sửa trong 1 lượt.

---

## 6. Nếu làm lại dự án từ đầu, tôi sẽ đổi gì?

1. **Neo toàn bộ mẫu `.gitignore` ngay từ CP0** (`/Phase*.md`, `/Note.md`) để tránh lỗi case-insensitive trên Windows.
2. **Thiết kế cỡ chữ `18 px` (`1rem`) và `[hidden] { display: none !important; }` ngay từ Phase 1** thay vì phải chỉnh lại toàn bộ hệ quy chiếu font-size ở Phase 4.
3. **Tạo sẵn launcher `scripts/run.mjs` ngay từ Phase 2** thay vì phụ thuộc `vite preview`, giúp lưu đĩa cục bộ (Settings/Leaderboard) và thêm cờ CLI (`--export-leaderboard`) mượt mà hơn.
4. **Hạn chế xoay nhiều vòng tạo hình nhân vật khi chưa khóa xong mốc phase:** Nên gắn tag phase ngay khi xong luật lõi, rồi mới chỉnh mỹ thuật client-only để giữ tiến độ mốc giờ chặt chẽ.
