# Đảo Đèn Lồng — Day 12 AI SDLC (Ba Hòn Đảo)

Game 3D góc nhìn thứ ba: điều khiển **Mây** vượt qua **3 Đêm** (*Đêm 1: Đảo Bến*, *Đêm 2: Đảo Cau*, *Đêm 3: Đảo Chuông*), thu thập **đom đóm**, thắp sáng toàn bộ **Đèn Lồng Lớn** trước bình minh, né **Bóng Mực** và đối phó với **Gió Lạc**.

- **Tác giả:** Nguyễn Quang Trung (`2A202603389`)
- **Trạng thái hiện tại:** Phase 3 (Change Request *"Đèn cạn dầu"* · **Test Contract v1.2**)
- **Đa nền tảng:** Chạy trực tiếp trên macOS, Linux và Windows với Node.js (>= 18).

---

## Cài đặt & Chạy (tối đa 3 lệnh)

```bash
npm install
npm run build
npm run preview
```

Mở trình duyệt tại địa chỉ hiển thị (mặc định `http://localhost:4173`).

---

## Điều khiển

| Phím / Thao tác | Hành động |
|---|---|
| `W` `A` `S` `D` hoặc `↑` `↓` `←` `→` | Di chuyển Mây (`6.0 m/s`, `7.2 m/s` khi có Bùa Gió) |
| `Space` | Nhảy (`7.0 m/s`, trọng lực `-20 m/s²`, chỉ nhảy khi chạm đất) |
| `Shift` | **Lướt (Dash)** — `14 m/s` trong `0.2s` (12 tick), hồi chiêu `1.5s`; lướt trên không giữ nguyên độ cao |
| `E` hoặc `F` | Tương tác đèn (bán kính `2.0m`): nạp thắp mới (`10`), thắp lại đèn từng sáng (`5`), hoặc **châm dầu** đèn đang sáng (`+10` dầu/đom đóm) |
| `Q` | **Tỏa Sáng (Pulse)** — tốn `3` đom đóm, bán kính 3D `5m` từ `chân + 0.8m`, đẩy `4m` trong 15 tick & choáng `2s` (120 tick; `+15` điểm nếu đang hút dầu), buộc Gió Lạc thả đom đóm |
| Di chuyển chuột (nhấp vào màn hình để khóa 360°) / Cuộn chuột / `J` `L` | Xoay camera 3D & zoom gần/xa quanh nhân vật (`2.6m–24m`) |
| `Esc` hoặc `P` | Tạm dừng (`paused` — đóng băng hoàn toàn logic, thời gian và dầu đèn) |

---

## Ba Hòn Đảo & Luật "Đèn Cạn Dầu" (Contract v1.2)

Mọi hằng số khớp tuyệt đối với [`game.contract.json`](game.contract.json) (`contract_version: "1.2"`):

- **Mục tiêu Bình Minh (`dawn_survived`):** Không còn thắng sớm khi thắp hết đèn; cần sống sót đến hết giờ và giữ số đèn đang sáng `≥ ceil(0.6 × tổng đèn)`:
  - **Đêm 1 — Đảo Bến (`240s`, 5 đèn, cần ≥ `3/5`):** Đảo tròn bán kính `40m`, rơi khỏi đảo (`Y < -10`) mất `1` Ngọn Lửa + toàn bộ đom đóm đang mang và hồi sinh sau `60` tick với `90` tick bất tử.
  - **Đêm 2 — Đảo Cau (`270s`, 6 đèn, cần ≥ `4/6`):** Hai đảo tròn bán kính `28m` nối bằng cầu tre hẹp không lan can (`x ∈ [26,44], z ∈ [-2,2]`), 2 bục nhảy gió, **Bùa Gió `C1`** trên cầu (`7.2 m/s` + Lướt không hồi chiêu `600` tick), và **Gió Lạc (`D1`, `D2`)** bay `7 m/s` cướp tối đa `3` đom đóm khi mang `≥ 5`.
  - **Đêm 3 — Đảo Chuông (`300s`, 7 đèn, cần ≥ `5/7`):** Đảo 3 tầng (`Y = 0, 3, 6`), 2 dốc rộng `3m` ở `30°`/`150°`, bục nhảy tầng 1 → tầng 2 tại `(0,3,13)`, Tháp Chuông cao `8m`, 2 Bùa Gió (`C1`, `C2`), Bóng Mực `4.5 m/s` và **Gió mạnh** mỗi `30s` (kéo dài `5s`, đẩy `2 m/s`, báo trước `2s`).
- **Nhiên liệu đèn & Bóng Mực hút dầu (`drain`):** Đèn sáng có `100` dầu, tự hao `1.0/giây` (tính theo đơn vị nguyên `1/60`). Đèn có `fuel < 30` mất vùng an toàn `6m`, nhấp nháy `1 Hz`, và thu hút Bóng Mực `wander` tiến vào `≤ 2m` chuyển sang `drain` hút `5/giây` (cộng dồn). Hết dầu (`≤ 0`) đèn tắt (`lantern_out`), thắp lại chỉ tốn `5` đom đóm (`ever_lit = true`).
- **Sức chứa tăng dần:** `capacity = min(20, 10 + 2 × successful_lights)` trong mỗi Đêm.
- **Chế độ mù màu ("Bảng màu dễ phân biệt"):** Bật/lưu trong Cài đặt — đổi viền & mắt Bóng Mực sang `#00B3FF`, màu cảnh báo UI sang `#FFFFFF` kèm biểu tượng `⚠`; đèn tắt luôn xẹp `20%` kèm vết rách giấy để phân biệt không cần màu.

### Công thức tính điểm (Contract v1.2)
| Sự kiện | Điểm |
|---|---|
| Nạp 1 đom đóm vào đèn (thắp mới, thắp lại hoặc châm dầu) | `+5` |
| Thắp đèn lần đầu (`relight: false`) | `+100` |
| Thắp lại đèn từng sáng (`relight: true`) | `+40` |
| Bóng Mực trúng Tỏa Sáng (`per_stun` / đang `drain`) | `+5` / tổng `+15` |
| Bình minh khi thắng: mỗi đèn đang sáng | `+50 + Math.floor(fuel)` |
| Bình minh khi thắng: mỗi Ngọn Lửa còn lại | `+50` |

Tổng điểm chiến dịch là tổng điểm các Đêm đã thắng (đã bỏ thưởng thời gian còn lại).

---

## Kiểm thử & Chế độ Headless (Test Contract v1.2)

Chạy toàn bộ bộ kiểm chứng (typecheck + build headless + 17 unit test + 12 kịch bản regression Phase 1–2 + 6 kịch bản mới Phase 3 + tất định SHA-256 cả 3 Đêm + benchmark Đêm 3 `18.000` tick `≤ 30s` + kiểm tra mã thoát `2`):

```bash
npm test
```

Chạy trực tiếp CLI headless (hỗ trợ `--night 1`, `2`, `3`):

```bash
node dist/headless/headless/cli.js --seed 42 --night 1 --ticks 600 --snapshot-every 10 --out tmp/out.jsonl
node dist/headless/headless/cli.js --seed 42 --night 2 --ticks 1200 --snapshot-every 20 --out tmp/n2.jsonl
node dist/headless/headless/cli.js --seed 42 --night 3 --ticks 18000 --snapshot-every 60 --out tmp/n3.jsonl
```

---

## Sáng tạo của tôi

Toàn bộ chi tiết sáng tạo chỉ chạy ở tầng client (`src/client/`), tắt hoàn toàn khi chạy headless nên **không làm thay đổi bất kỳ byte nào của Test Contract v1.1**:

1. **Nhân vật Mây phong cách Chibi Kiếm Sĩ Nón Trắng (Scarlet) & Bóng Mực tạo hình Doro (`src/client/scene.ts`):** Mây được dựng thủ tục 100% với **nón lá cơ khí trắng rộng vành** có họa tiết viền đỏ `#C8102E` (`CanvasTexture`), chỏm lông đen, hai tấm giáp vành đỏ-trắng đung đưa, tóc tím bạc dài tung bay, mắt nâu hổ phách, áo haori trắng lót đỏ `#C8102E`, giáp vai samurai xếp tầng bên trái, dây thừng obi đỏ tua trắng, thanh kiếm chuôi trắng chéo trước ngực và đèn lồng mini phát sáng đeo hông, kèm **cuộn chuột zoom mượt** (`2.6m–24m`); toàn bộ Bóng Mực spawn được tạo hình chibi **Doro** 4 chân trắng chạy lạch bạch, tóc hồng búi hoa hồng + nơ tím & dải ruy-băng trắng, mắt tím mặt `:3` cùng hiệu ứng phân biệt rõ 5 trạng thái (`spawning`, `wander`, `chase`, `recoil`, `stunned`); Gió Lạc có 2 hình dạng (*Hạc Lụa*, *Hồ Ly Lụa*) kèm đom đóm có cánh vỗ.
2. **La bàn Đom Đóm Dẫn Đường & Hiệu ứng khí quyển (`src/client/scene.ts`):** Mũi tên vàng xoay quanh chân Mây kết hợp mũi tên viền màn hình khi đèn gần nhất nằm ngoài góc nhìn; ánh trăng bạc dịu, biển mây trôi quanh 3 hòn đảo, lá vàng bay báo trước gió mạnh 2 giây trên Đảo Chuông, hào quang Lướt/Bùa Gió và vòng ánh sáng an toàn `6m` quanh đèn đã thắp.
3. **Nhạc đêm & âm thanh ngũ cung thủ tục Web Audio API (`src/client/audio.ts`):** Nhạc nền đêm ngũ cung nhẹ nhàng cùng đủ hiệu ứng âm thanh cho nhặt, thắp đèn, tỏa sáng, nhảy, lướt, bùa gió, Gió Lạc, bị đánh, Bóng Mực xuất hiện, cảnh báo gió, đếm ngược 10 giây cuối, thắng và thua (chỉnh & lưu âm lượng trong Cài đặt).

**Bằng chứng phần lõi không bị ảnh hưởng:** `tsconfig.headless.json` chỉ biên dịch `src/sim/` và `src/headless/` (không import `src/client/`), và toàn bộ 17 unit test + 21 kịch bản contract/regression/determinism/benchmark đều **PASS** ([`docs/proof/phase-3/contract-report.md`](docs/proof/phase-3/contract-report.md)).

---

## Hồ sơ SDLC, Harness AI & Bằng chứng

- **Harness AI:** [`AGENTS.md`](AGENTS.md), Skill [`.agents/skills/verify-phase/SKILL.md`](.agents/skills/verify-phase/SKILL.md), Hook [`.githooks/pre-push`](.githooks/pre-push), CI [`.github/workflows/verify.yml`](.github/workflows/verify.yml)
- **Đặc tả, ADR & Changelog:** [Phase 1](docs/notes/phase-1-assumptions.md) · [Phase 2](docs/notes/phase-2-spec.md) · [ADR-001 (Phase 3)](docs/notes/adr-001-lantern-fuel-and-dawn-win.md) · [`CHANGELOG.md`](CHANGELOG.md)
- **Nhật ký dùng AI & Token:** [`docs/notes/ai-log.md`](docs/notes/ai-log.md)
- **Bằng chứng kiểm chứng:** [Phase 1](docs/proof/phase-1/README.md) · [Phase 2](docs/proof/phase-2/README.md) · [Phase 3](docs/proof/phase-3/README.md) · [Báo cáo Contract v1.2](docs/proof/phase-3/contract-report.md)
- **Tài liệu lab gốc:** [GUIDE.md](GUIDE.md) · [CHECKPOINTS.md](CHECKPOINTS.md) · [SUBMISSION.md](SUBMISSION.md) · [RULES.md](RULES.md) · [RUBRIC.md](RUBRIC.md)
