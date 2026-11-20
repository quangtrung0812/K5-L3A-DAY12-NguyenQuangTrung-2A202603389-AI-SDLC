# CREDITS — Nguồn Asset, Thư viện & Công cụ AI

Dự án **Đảo Đèn Lồng** (v1.0.0) — Tác giả: **Nguyễn Quang Trung (`2A202603389`)**.

---

## 1. Thư viện & Công cụ Mã nguồn mở

| Thành phần | Phiên bản | Giấy phép | Vai trò |
|---|---|---|---|
| [Three.js](https://threejs.org/) | `^0.174.0` | MIT | Engine dựng hình 3D WebGL2 cho tầng hiển thị (`src/client/`) |
| [Vite](https://vite.dev/) | `^6.2.1` | MIT | Công cụ dev server & đóng gói production bundle (`dist/web/`) |
| [TypeScript](https://www.typescriptlang.org/) | `^5.8.2` | Apache-2.0 | Kiểm tra kiểu tĩnh và biên dịch lõi thuần `src/sim/` & `src/headless/` |
| [Vitest](https://vitest.dev/) | `^3.0.8` | MIT | Framework kiểm thử đơn vị (`tests/sim.test.ts`) |
| [Node.js](https://nodejs.org/) | `>= 18` (đo trên `v24.18.1`) | MIT | Môi trường chạy CLI headless, soak test, benchmark launcher và local leaderboard server |

---

## 2. Đồ họa 3D, Chất liệu & Tạo hình (100% Thủ tục — Không dùng file binary ngoài)

- **Địa hình 3 Đêm (Đảo Bến, Đảo Cau, Đảo Chuông), Đèn Lồng, Đom Đóm, Bùa Gió, Gió Lạc, Biển Mây:** Tạo thủ tục bằng hình học cơ bản của Three.js trong `src/client/scene.ts`, tuân thủ bảng màu chuẩn 20 mã màu và chế độ mù màu (`#00B3FF` / `#FFFFFF`).
- **Tạo hình sáng tạo client-only (tắt hoàn toàn trong Headless, Benchmark và Soak test):**
  - Nhân vật Mây (phong cách chibi kiếm sĩ nón trắng cầm đèn lồng) và Bóng Mực (phong cách chibi 4 chân Doro) được dựng thủ tục 100% bằng hình học Three.js + `CanvasTexture` sinh lúc chạy, lấy cảm hứng từ phong cách chibi fan-art (*Goddess of Victory: Nikke*, thuộc bản quyền SHIFT UP / Level Infinite; chỉ dùng cho mục đích học tập cá nhân trong bài lab, không thương mại hóa).
  - Biểu tượng giao diện dùng ký tự Unicode chuẩn (`🔥`, `⚠`, `💨`, `✨`, `▲`) và CSS thuần.

---

## 3. Âm thanh & Nhạc nền (100% Tổng hợp Web Audio API)

- Toàn bộ nhạc nền đêm âm giai ngũ cung và 18 hiệu ứng âm thanh (nhặt đom đóm, nạp đèn, thắp đèn, châm dầu, tắt đèn, cảnh báo hút dầu, Tỏa Sáng, nhảy, Lướt, Bùa Gió, Gió Lạc cướp/rơi, bị đánh, Bóng Mực xuất hiện, cảnh báo gió, đếm ngược 10 giây cuối, thắng/thua) được tổng hợp thủ tục thời gian thực trong `src/client/audio.ts` bằng **Web Audio API** (không sử dụng file `.mp3`/`.wav` bên ngoài).

---

## 4. Công cụ AI hỗ trợ phát triển

- **Antigravity (Google DeepMind Coding Agent):** Hỗ trợ sinh mã nguồn TypeScript/Three.js, xây dựng bộ kiểm thử tự động Contract v1.0 → v1.3, chạy đánh giá độc lập qua subagent `research`, và biên soạn tài liệu SDLC (ADR, Changelog, Proof, Retro).
- Mọi yêu cầu, kịch bản kiểm chứng, số đo hiệu năng (`bench.json`, `soak.json`) và xác nhận trực quan đều do tác giả kiểm duyệt và chạy thực tế trên máy cục bộ.
