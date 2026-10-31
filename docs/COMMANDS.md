# Hong Kong Mahjong: Commands & Operations Guide

Comprehensive cheatsheet for server operations, deep learning training, model export, evaluation benchmarks, and local game development.

---

## 1. Remote Azure Training Server

### Connect via SSH
```bash
ssh -i azure_connection/vm-mahjong-train_key.pem azureuser@20.187.83.32
```

### Activate Remote Virtual Environment
```bash
# On the Azure VM:
source ~/mj_train_env/bin/activate
cd ~/hongkongmahjong/azure_train
```

### Git Synchronization on VM
```bash
# Pull latest commits:
cd ~/hongkongmahjong && git pull

# Hard-reset to remote branch (if rebased):
cd ~/hongkongmahjong && git fetch origin && git reset --hard origin/main
```

### Process & Background Job Management
```bash
# List running python/training processes:
ps aux | grep -E 'python|train' | grep -v grep

# Tail training logs live:
tail -f ~/hongkongmahjong/azure_train/expert_bc_v2.log

# Gracefully terminate training:
pkill -f train_azure_selfplay.py
pkill -f evaluate_imitation.py

# Force terminate:
pkill -9 -f train_azure_selfplay.py
```

### Detached Session with `tmux` (Recommended)
```bash
# Start a new tmux session:
tmux new -s train

# Inside tmux, run training:
cd ~/hongkongmahjong/azure_train
source ~/mj_train_env/bin/activate
python -u evaluate_imitation.py --checkpoint checkpoints/hk_expert_bc_v2.pt --out checkpoints/hk_expert_bc_v3.pt ...

# Detach from tmux: Press Ctrl+B, then D
# Re-attach to tmux later:
tmux attach -t train
```

---

## 2. Model Training Pipelines (Azure Server)

### A. 3-Faan Expert Imitation Training (`evaluate_imitation.py`)
Trains the CNN trunk and policy heads on tactical demonstrations from the 3-faan expert teacher:
```bash
cd ~/hongkongmahjong/azure_train
source ~/mj_train_env/bin/activate

nohup python -u evaluate_imitation.py \
  --checkpoint checkpoints/hk_expert_bc_v2.pt \
  --out checkpoints/hk_expert_bc_v3.pt \
  --teacher-mode expert \
  --bc-updates 200 \
  --bc-games 35 \
  --bc-seed 1000000000 \
  --validation-games 100 \
  --validation-seed 1500400000 \
  --eval-games 500 \
  --eval-seed 2500000000 \
  --lr 0.00015 \
  --epochs 2 \
  > expert_bc_v3.log 2>&1 &
```

### B. Value-Head Warmup & Calibration (`warmup_value_head.py`)
Freezes the CNN trunk and policy heads, and trains only the value head on observed returns:
```bash
cd ~/hongkongmahjong/azure_train
source ~/mj_train_env/bin/activate

python -u warmup_value_head.py \
  --checkpoint checkpoints/hk_expert_bc_v2.pt \
  --out checkpoints/hk_expert_warmed.pt \
  --train-games 300 \
  --validation-games 100 \
  --epochs 20 \
  --lr 0.0001
```

### C. Self-Play PPO Training (`train_azure_selfplay.py`)
Executes multi-worker teacher-assisted PPO on self-play and opponent games:
```bash
cd ~/hongkongmahjong/azure_train
source ~/mj_train_env/bin/activate

export OMP_NUM_THREADS=1
export MKL_NUM_THREADS=1

nohup python -u train_azure_selfplay.py \
  --resume checkpoints/hk_expert_warmed.pt \
  --out checkpoints/hk_expert_ppo.pt \
  --workers 6 \
  --games 6 \
  --updates 200 \
  --epochs 4 \
  --minibatch 256 \
  --lr 0.0001 \
  --local-prob 0.5 \
  --self-prob 0.4 \
  --eval-every 20 \
  --eval-games 100 \
  > ppo_train.log 2>&1 &
```

---

## 3. Model Export & Local Deployment

### Export PyTorch Checkpoint to ONNX (Run on Azure VM)
```bash
cd ~/hongkongmahjong/azure_train
source ~/mj_train_env/bin/activate

python export_onnx.py \
  --ckpt checkpoints/hk_expert_bc_v2.pt \
  --out hk_mahjong_agent.onnx
```

### Download ONNX Model to Local Repo (Run on Local Machine)
```bash
# Copies both the ONNX graph and weights into local models/
scp -i azure_connection/vm-mahjong-train_key.pem \
  azureuser@20.187.83.32:/home/azureuser/hongkongmahjong/azure_train/hk_mahjong_agent.onnx \
  azureuser@20.187.83.32:/home/azureuser/hongkongmahjong/azure_train/hk_mahjong_agent.onnx.data \
  ./models/
```

---

## 4. Evaluation & Verification

### Remote 500-Hand Held-Out Benchmark (Run on Azure VM)
Evaluates local rule-based AI, expert teacher, and neural policies on fresh seeds:
```bash
cd ~/hongkongmahjong/azure_train
source ~/mj_train_env/bin/activate

python -u evaluate_imitation.py \
  --checkpoint checkpoints/hk_expert_bc_v2.pt \
  --validation-games 100 \
  --validation-seed 1500400000 \
  --eval-games 500 \
  --eval-seed 2500000000
```

### Local Table Simulation Benchmark (`scripts/compare-ai.ts`)
Rotates the neural ONNX model through all 4 seats against 3 table rule-based AI seats:
```bash
# Quick 4-session test (4 four-round matches):
npm run compare:ai

# Full 20-session benchmark (~380 hands):
npm run compare:ai:long

# Custom number of sessions:
npx tsx scripts/compare-ai.ts --sessions 16
```

### Value Head Diagnostic (`check_value_head.py`)
Compares predicted value against actual Monte Carlo returns:
```bash
cd ~/hongkongmahjong/azure_train
source ~/mj_train_env/bin/activate

python check_value_head.py \
  --checkpoint checkpoints/hk_expert_bc_v2.pt \
  --games 100
```

---

## 5. Local Game & AI Coach Development

### Start Local Web Game
```bash
npm run dev
# Opens at http://localhost:5173
```

### Start Local AI Coach Backend Server
```bash
# Using npm script:
npm run coach:serve

# Or directly:
source .venv/bin/activate
python ai_assistant/serve.py
# Runs at http://127.0.0.1:8765
```

Endpoints:
- `GET /status`: checks if ONNX engine is loaded.
- `POST /act`: returns recommended move for automated agents.
- `POST /advise`: returns detailed Cantonese advice and fan explanation for the coach UI.

---

## 6. Directory Map

| Directory / File | Description |
|---|---|
| `azure_train/` | PyTorch training environment on the Azure VM |
| `azure_train/local_policy.py` | 3-faan tactical expert policy & fast cached shanten |
| `azure_train/train_azure_selfplay.py` | Multi-worker self-play PPO engine |
| `azure_train/evaluate_imitation.py` | Teacher-imitation behavior cloning & evaluation |
| `azure_train/warmup_value_head.py` | Value head ridge regression & warmup |
| `azure_train/export_onnx.py` | Exports PyTorch checkpoints to ONNX |
| `ai_assistant/` | Local lightweight inference server (no PyTorch needed) |
| `models/` | Deployed ONNX models (`hk_mahjong_agent.onnx`) |
| `scripts/` | Local benchmarking tools (`compare-ai.ts`, `onnx_worker.py`) |
| `docs/` | Comprehensive documentation & handoff reports |
| `src/` | React + TypeScript web game application |

