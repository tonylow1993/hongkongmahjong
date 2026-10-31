#!/bin/bash
# Quick smoke test of environment and model evaluation
cd "$(dirname "$0")/.." || exit 1
source ~/mj_train_env/bin/activate

python -m py_compile train_azure_selfplay.py env.py local_policy.py evaluate_imitation.py
python env.py

python -u evaluate_imitation.py \
  --checkpoint checkpoints/hk_expert_bc_v2.pt \
  --eval-games 10 \
  --eval-seed 2500000000
