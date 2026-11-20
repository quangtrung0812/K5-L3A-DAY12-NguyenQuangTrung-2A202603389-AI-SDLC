# Đảo Đèn Lồng — Day 12 AI SDLC (Ba Hòn Đảo)

Game 3D góc nhìn thứ ba: điều khiển **Mây** vượt qua **3 Đêm** (*Đêm 1: Đảo Bến*, *Đêm 2: Đảo Cau*, *Đêm 3: Đảo Chuông*), thu thập **đom đóm**, thắp sáng toàn bộ **Đèn Lồng Lớn** trước bình minh, né **Bóng Mực** và đối phó với **Gió Lạc**.

- **Tác giả:** Nguyễn Quang Trung (`2A202603389`)
- **Trạng thái hiện tại:** Phase 2 (Ba Hòn Đảo · Chuẩn hóa số liệu · **Test Contract v1.1**)
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
| `E` hoặc `F` | Nạp đom đóm vào Đèn Lồng Lớn chưa sáng gần nhất (bán kính `2.0m`, cần `10` đom đóm/đèn) |
| `Q` | **Tỏa Sáng (Pulse)** — tốn `3` đom đóm, bán kính 3D `5m` từ `chân + 0.8m`, đẩy `4m` trong 15 tick & choáng `2s` (120 tick), buộc Gió Lạc thả đom đóm |
| Di chuyển chuột (nhấp vào màn hình để khóa 360°) / Cuộn chuột / `J` `L` | Xoay camera 3D & zoom gần/xa quanh nhân vật (`2.6m–24m`) |
| `Esc` hoặc `P` | Tạm dừng (`paused` — đóng băng hoàn toàn logic) |

---

## Ba Hòn Đảo & Luật chơi chuẩn hóa (Contract v1.1)

Mọi hằng số khớp tuyệt đối với [`game.contract.json`](game.contract.json) (`contract_version: "1.1"`):

- **Đêm 1 — Đảo Bến (`300s`, 5 đèn):** Đảo tròn bán kính `40m`, rơi khỏi đảo (`Y < -10`) mất `1` Ngọn Lửa + toàn bộ đom đóm đang mang và hồi sinh sau `60` tick với `90` tick bất tử.
- **Đêm 2 — Đảo Cau (`330s`, 6 đèn):** Hai đảo tròn bán kính `28m` nối bằng cầu tre hẹp không lan can (`x ∈ [26,44], z ∈ [-2,2]`), 2 bục nhảy gió bắn xuyên đảo, **Bùa Gió `C1`** trên cầu (`7.2 m/s` + Lướt không hồi chiêu trong `600` tick), và **Gió Lạc (`D1`, `D2`)** bay nhanh `7 m/s` cướp tối đa `3` đom đóm khi Mây mang `≥ 5`.
- **Đêm 3 — Đảo Chuông (`360s`, 7 đèn):** Đảo 3 tầng (`Y = 0, 3, 6`), 2 dốc thẳng rộng `3m` ở góc `30°` và `150°`, bục nhảy tầng 1 → tầng 2 tại `(0,3,13)`, Tháp Chuông cao `8m` (bán kính `2m`), 2 Bùa Gió (`C1`, `C2`), Bóng Mực nhanh `4.5 m/s` và **Gió mạnh** chu kỳ mỗi `30s` (kéo dài `5s`, đẩy `2 m/s`, báo trước `2s` bằng lá vàng bay & âm thanh).

### Công thức tính điểm (chuẩn hóa v1.1)
| Sự kiện | Điểm |
|---|---|
| Nạp 1 đom đóm vào đèn (`per_mote`) | `+10` |
| Thắp sáng 1 Đèn Lồng Lớn (`per_lantern`) | `+100` |
| Mỗi Bóng Mực trúng Tỏa Sáng (`per_stun`, kể cả đang choáng) | `+5` |
| Thưởng thời gian còn lại **khi thắng** (`per_second_left`) | `+2 × Math.floor(time_left_s)` |
| Thưởng Ngọn Lửa còn lại **khi thắng** (`per_flame_left`) | `+50 × flames` |

Tổng điểm chiến dịch là tổng điểm các Đêm đã thắng.

---

## Kiểm thử & Chế độ Headless (Test Contract v1.1)

Chạy toàn bộ bộ kiểm chứng (typecheck + build headless + 16 unit test + 6 kịch bản regression Phase 1 + 6 kịch bản tính năng mới Phase 2 + tất định SHA-256 cả 3 Đêm + benchmark 21.600 tick `≤ 30s` + kiểm tra mã thoát `2`):

```bash
npm test
```

Chạy trực tiếp CLI headless (hỗ trợ `--night 1`, `2`, `3`):

```bash
node dist/headless/headless/cli.js --seed 42 --night 1 --ticks 600 --snapshot-every 10 --out tmp/out.jsonl
node dist/headless/headless/cli.js --seed 42 --night 2 --ticks 1200 --snapshot-every 20 --out tmp/n2.jsonl
node dist/headless/headless/cli.js --seed 42 --night 3 --ticks 21600 --snapshot-every 60 --out tmp/n3.jsonl
```

---

## Sáng tạo của tôi

Toàn bộ chi tiết sáng tạo chỉ chạy ở tầng client (`src/client/`), tắt hoàn toàn khi chạy headless nên **không làm thay đổi bất kỳ byte nào của Test Contract v1.1**:

1. **Nhân vật Mây phong cách Chibi Kiếm Sĩ Nón Trắng (Scarlet) & Bóng Mực tạo hình Doro (`src/client/scene.ts`):** Mây được dựng thủ tục 100% với **nón lá cơ khí trắng rộng vành** có họa tiết viền đỏ `#C8102E` (`CanvasTexture`), chỏm lông đen, hai tấm giáp vành đỏ-trắng đung đưa, tóc tím bạc dài tung bay, mắt nâu hổ phách, áo haori trắng lót đỏ `#C8102E`, giáp vai samurai xếp tầng bên trái, dây thừng obi đỏ tua trắng, thanh kiếm chuôi trắng chéo trước ngực và đèn lồng mini phát sáng đeo hông, kèm **cuộn chuột zoom mượt** (`2.6m–24m`); toàn bộ Bóng Mực spawn được tạo hình chibi **Doro** 4 chân trắng chạy lạch bạch, tóc hồng búi hoa hồng + nơ tím & dải ruy-băng trắng, mắt tím mặt `:3` cùng hiệu ứng phân biệt rõ 5 trạng thái (`spawning`, `wander`, `chase`, `recoil`, `stunned`); Gió Lạc có 2 hình dạng (*Hạc Lụa*, *Hồ Ly Lụa*) kèm đom đóm có cánh vỗ.
2. **La bàn Đom Đóm Dẫn Đường & Hiệu ứng khí quyển (`src/client/scene.ts`):** Mũi tên vàng xoay quanh chân Mây kết hợp mũi tên viền màn hình khi đèn gần nhất nằm ngoài góc nhìn; ánh trăng bạc dịu, biển mây trôi quanh 3 hòn đảo, lá vàng bay báo trước gió mạnh 2 giây trên Đảo Chuông, hào quang Lướt/Bùa Gió và vòng ánh sáng an toàn `6m` quanh đèn đã thắp.
3. **Nhạc đêm & âm thanh ngũ cung thủ tục Web Audio API (`src/client/audio.ts`):** Nhạc nền đêm ngũ cung nhẹ nhàng cùng đủ hiệu ứng âm thanh cho nhặt, thắp đèn, tỏa sáng, nhảy, lướt, bùa gió, Gió Lạc, bị đánh, Bóng Mực xuất hiện, cảnh báo gió, đếm ngược 10 giây cuối, thắng và thua (chỉnh & lưu âm lượng trong Cài đặt).

**Bằng chứng phần lõi không bị ảnh hưởng:** `tsconfig.headless.json` chỉ biên dịch `src/sim/` và `src/headless/` (không import `src/client/`), và toàn bộ 16 unit test + 15 kịch bản contract/regression/determinism/benchmark đều **PASS** ([`docs/proof/phase-2/contract-report.md`](docs/proof/phase-2/contract-report.md)).

---

## Hồ sơ SDLC, Harness AI & Bằng chứng

- **Harness AI:** [`AGENTS.md`](AGENTS.md), Skill [`.agents/skills/verify-phase/SKILL.md`](.agents/skills/verify-phase/SKILL.md), Hook [`.githooks/pre-push`](.githooks/pre-push), CI [`.github/workflows/verify.yml`](.github/workflows/verify.yml)
- **Đặc tả & Giả định:** [Phase 1](docs/notes/phase-1-assumptions.md) · [Phase 2](docs/notes/phase-2-spec.md)
- **Nhật ký dùng AI & Token:** [`docs/notes/ai-log.md`](docs/notes/ai-log.md)
- **Bằng chứng kiểm chứng:** [Phase 1](docs/proof/phase-1/README.md) · [Phase 2](docs/proof/phase-2/README.md) · [Báo cáo Contract v1.1](docs/proof/phase-2/contract-report.md)
- **Tài liệu lab gốc:** [GUIDE.md](GUIDE.md) · [CHECKPOINTS.md](CHECKPOINTS.md) · [SUBMISSION.md](SUBMISSION.md) · [RULES.md](RULES.md) · [RUBRIC.md](RUBRIC.md)
