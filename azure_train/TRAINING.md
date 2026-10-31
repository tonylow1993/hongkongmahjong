# Offline coach: train on Azure, play locally

Training runs on an Azure CPU VM. The finished network is exported to one `.onnx` file and copied back to this repo. The browser never calls Azure. A small local Python process reads that file and the table shows **AI 戰術教練**.

Training pays the authentic **半辣上** standard schedule: 3 fan = 8 pts (1 辣), 4 fan = 16 pts (2 辣), 5 fan = 24 pts (3 辣), 6 fan = 32 pts (4 辣), 7 fan = 48 pts (6 辣), 8 fan = 64 pts (8 辣), 10 fan = 128 pts (16 辣). Deal-in is paid full by discarder; self-draw is split half by each of the three other seats (each pays base / 2, winner collects base * 1.5). One seat learns. The other three play the table's local AI.

## What runs where

| Place | Directory | Needs |
|---|---|---|
| Azure VM | `azure_train/` | PyTorch, NumPy, ONNX, ONNX Runtime |
| This machine | `ai_assistant/` and `models/` | NumPy, ONNX Runtime. No PyTorch |

Run every Python command in this guide from `azure_train/` on the VM, or from the repo root on your machine, as written. The training scripts import `model` and `env` as local modules.

## 1. One-time VM setup

Ubuntu 22.04, for example `Standard_F16s_v2`. No GPU packages.

If `azure_train/.venv` does not exist yet:

```bash
cd ~/hongkongmahjong/azure_train
bash setup_azure_vm.sh
source .venv/bin/activate
```

If the prompt already shows an environment such as `(mj_train_env)`, skip both lines. That environment already has the packages.

Confirm:

```bash
python -c "import torch, onnxruntime; print('ok')"
```

## 2. Train

Only one training job at a time. This command overwrites `train.log` and, on every update, `checkpoints/hk_mahjong.pt`.

```bash
cd ~/hongkongmahjong/azure_train
nohup python train_azure_selfplay.py --workers 6 --games 6 --updates 300 --epochs 4 > train.log 2>&1 &
```

`[1] 4710` means the shell started process 4710. It does not mean the first update has finished.

Check:

```bash
ps -p 4710 -o pid,etime,cmd
tail -n 30 train.log
```

A healthy log looks like this:

```text
params=679464 workers=6
update 1/300 loss=0.0210 entropy=2.410 draw=94.4% hu=5.6% ron=3.1% mean_faan=3.40 hands=36 steps=3600
eval vs random n=50 win=8.0% deal_in=4.0% draw=80.0% mean_faan=3.60
```

- `draw` / `hu` / `ron` / `mean_faan` are from that update's self-play hands. `draw` falling is the sign that hands are no longer all 流局. `mean_return` is not printed: it stays near 0 because every seat is averaged.
- `entropy` should stay well above 0. If it collapses toward 0 early, the policy has stopped exploring.
- `eval vs random` is printed every 20 updates and at the end. One seat uses the current net, the other three take a legal 糊 or a random legal tile. Watch `win` and `mean_faan` on these lines. The self-play `hu` rate is only "someone won," not the net's strength against a fixed opponent.
- `params=679464` is the network size (5 residual blocks, 64 channels, about 680k parameters).
- Each worker sets `torch.set_num_threads(1)`.
- The first update can sit with no new lines while those games finish. Six workers times six games is slower per update than the old two-game setting.
- A checkpoint is saved after every update, so a stopped job still leaves the latest weights.

Defaults are `--games 6`, `--epochs 4`, `--entropy 0.01`, `--eval-every 20`, `--eval-games 50`. The loss is policy plus half the value error, minus `0.01 * entropy`.

Stop a job only if you mean to:

```bash
kill 4710
```

## 3. Export

Wait until the log contains both of these lines:

```text
update 300/300 ...
wrote checkpoints/hk_mahjong.pt
```

Then, still inside `azure_train/` and still in the same virtualenv:

```bash
python export_onnx.py --ckpt checkpoints/hk_mahjong.pt --out hk_mahjong_agent.onnx
```

This is a second command. Do not paste it on the same line as `nohup`, and do not run it while training is still going. Export checks that PyTorch and ONNX Runtime agree within `1e-4`. If that check fails, the script exits and does not leave a file you should copy.

The file has a dynamic batch size and fixed spatial size `[batch, 16, 4, 9]`. Outputs are `discard_logits`, `claim_logits`, and `expected_value`.

## 4. Copy the model home

From your own machine, not from the VM:

```bash
scp azureuser@<vm>:~/hongkongmahjong/azure_train/hk_mahjong_agent.onnx \
    ./models/hk_mahjong_agent.onnx
```

The coach looks only at `models/hk_mahjong_agent.onnx`.

## 5. Local coach

One-time install on this machine:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r ai_assistant/requirements.txt
```

Each time you play, use two terminals at the repo root.

```bash
npm run dev
```

```bash
source .venv/bin/activate
python ai_assistant/serve.py
```

Open the site and press **AI 戰術教練**. On your discard or call, the page posts the table to `http://127.0.0.1:8765/advise`.

Without the `.onnx` file, the panel still answers from the rules. Confidence stays `0.5` and expected value stays `+0.0 點`. After the file is in `models/`, the same server uses ONNX Runtime on CPU and the latency field should stay under 5 ms.

## 6. Train again

Do not run `setup_azure_vm.sh` again unless the VM is new or `import torch` fails.

```bash
cd ~/hongkongmahjong/azure_train
# activate only when the prompt has no environment name
nohup python train_azure_selfplay.py --workers 6 --games 6 --updates 300 --epochs 4 > train.log 2>&1 &
```

When the new log shows `wrote checkpoints/hk_mahjong.pt`, run `export_onnx.py` again and `scp` the new file over the old `models/hk_mahjong_agent.onnx`. Restart `python ai_assistant/serve.py` so it loads the new file. Refresh the page.

## Rules the trainer enforces

- 34 playing tiles on a 4×9 grid. Flowers are extra planes, not part of the 34 discard outputs.
- Discard policy: 34 tiles. Call policy: 過、吃、碰、槓、糊. Value head: expected 辣, divided by 20 in the trainer.
- Illegal choices are masked before the loss: a tile not in hand, 吃 from any seat except the next player, 糊 under 3 faan.
- 半辣上: 3 fan = 8 pts, 4 = 16 pts, 5 = 24 pts, 6 = 32 pts, 7 = 48 pts, 8 = 64 pts, 10 = 128 pts, 13 = 256 pts. Deal-in is paid full by discarder (+base for winner, -base for discarder). Self-draw is split half by each of the three other seats (each pays base / 2, winner collects base * 1.5). No dealer multiplier.
- There is no extra penalty for feeding a fourth meld.

Fan lines used for the reward are the ones on the website: 門清, 自摸, 平胡, 正花, 無花, 混一色, 清一色, 對對糊, dragons, seat wind, and round wind. Flowers do not break 門清, and a wind or dragon pair still counts as 平胡. One seat is the learner. Early updates play the other three seats at random, so the learner can actually win and receive 辣. The share of 本地 AI opponents rises to 100% by the last update. Watch `learner_hu` in the log. `hu` counts any seat winning and can stay high while the learner is still losing.

## Files

| Path | Keep? |
|---|---|
| `azure_train/checkpoints/hk_mahjong.pt` | On the VM. Overwritten every update |
| `azure_train/train.log` | On the VM. Overwritten when you start with `>` |
| `azure_train/hk_mahjong_agent.onnx` | Produced by export. Copy it home |
| `models/hk_mahjong_agent.onnx` | The file the coach loads |
| `azure_train/.venv/`, `checkpoints/` | Not committed |
