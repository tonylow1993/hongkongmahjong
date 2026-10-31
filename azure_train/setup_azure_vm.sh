#!/usr/bin/env bash
# Ubuntu 22.04 CPU VM (example: Standard_F16s_v2). No GPU packages.
set -euo pipefail
sudo apt-get update
sudo apt-get install -y python3-pip python3-venv
cd "$(dirname "$0")"
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
mkdir -p checkpoints
echo "Start training:"
echo "  source .venv/bin/activate"
echo "  nohup python train_azure_selfplay.py --workers 8 --updates 200 > train.log 2>&1 &"
