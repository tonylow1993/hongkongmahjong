#!/bin/bash
# Start imitation training from current best checkpoint hk_expert_bc_v2.pt
cd "$(dirname "$0")/.." || exit 1
source ~/mj_train_env/bin/activate

nohup python -u evaluate_imitation.py \
  --checkpoint checkpoints/hk_expert_bc_v2.pt \
  --out checkpoints/hk_expert_bc_v3.pt \
  --teacher-mode expert \
  --bc-updates 200 \
  --bc-games 35 \
  --lr 0.00015 \
  --epochs 2 \
  > expert_bc_v3.log 2>&1 &

echo "Training launched in background. Tail log with: tail -f azure_train/expert_bc_v3.log"
