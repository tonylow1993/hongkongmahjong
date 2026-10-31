#!/usr/bin/env bash
set -euo pipefail

ulimit -n 65536 2>/dev/null || ulimit -n 4096 2>/dev/null || true

BASE_DIR="/home/azureuser/hongkongmahjong/azure_train"
PY_BIN="/home/azureuser/mj_train_env/bin/python"
CKPT_DIR="${BASE_DIR}/checkpoints"
LOCK_FILE="/tmp/mj_auto_evolve.lock"
CONVERGED_FLAG="${CKPT_DIR}/CONVERGED"
BEST_CKPT="${CKPT_DIR}/hk_expert_beater_v8.pt.best.pt"
ROUND_OUT="${CKPT_DIR}/hk_expert_beater_v8_round.pt"
STREAK_FILE="${CKPT_DIR}/no_improve_streak.txt"
ROUND_FILE="${CKPT_DIR}/round_num.txt"
BEST_SCORE_FILE="${CKPT_DIR}/best_score.txt"
MAX_NO_IMPROVE=25

mkdir -p "${CKPT_DIR}"

if [ -f "${CONVERGED_FLAG}" ]; then
    exit 0
fi

# Ensure only one training instance runs at a time
exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
    exit 0
fi

# Double-check if a python training process is already running
if pgrep -f "train_azure_selfplay.py" >/dev/null 2>&1; then
    exit 0
fi

cd "${BASE_DIR}"

ROUND=$(cat "${ROUND_FILE}" 2>/dev/null || echo "1")
STREAK=$(cat "${STREAK_FILE}" 2>/dev/null || echo "0")
PREV_BEST=$(cat "${BEST_SCORE_FILE}" 2>/dev/null || echo "-999.0")

SEED=$((300000 + ROUND * 10000))
EVAL_SEED=1500000000
ROUND_LOG="${BASE_DIR}/evolve_round_${ROUND}.log"

EXPERT_BASELINE="-0.700"

# 動態排程：只要領先同場 Expert (${EXPERT_BASELINE})，即加入 self 與 random 探索更高得分
if awk "BEGIN {exit !(${PREV_BEST} < ${EXPERT_BASELINE})}"; then
    # Stage 1: 若落後 Expert，100% Expert 專項陪練 (0% Self, 0% Random)
    LOCAL_PROB=1.0
    SELF_PROB=0.0
    BC_UPDATES=0
    BC_START=0.18
    BC_END=0.08
elif awk "BEGIN {exit !(${PREV_BEST} < 0.30)}"; then
    # Stage 2: 領先同場 Expert，立即加入 Self-play (45% Self, 45% Expert, 10% Random)
    LOCAL_PROB=0.45
    SELF_PROB=0.45
    BC_UPDATES=0
    BC_START=0.10
    BC_END=0.02
else
    # Stage 3: 大幅領先 Expert (score >= 0.30)，深化自對弈演化，保持 40% Expert 陪練防止防守策略漂移
    LOCAL_PROB=0.40
    SELF_PROB=0.50
    BC_UPDATES=0
    BC_START=0.06
    BC_END=0.01
fi

echo "============================================================"
echo "[$(date -Is)] Starting Auto-Evolution Round ${ROUND} (seed=${SEED}, local_prob=${LOCAL_PROB}, self_prob=${SELF_PROB}, bc_updates=${BC_UPDATES}, best_score=${PREV_BEST})"
echo "============================================================"

rm -f "${ROUND_OUT}" "${ROUND_OUT}.best.pt"

RESUME_FLAG=""
if [ -f "${BEST_CKPT}" ]; then
    RESUME_FLAG="--resume ${BEST_CKPT}"
fi

"${PY_BIN}" -u train_azure_selfplay.py \
    --workers 6 \
    --games 8 \
    --updates 80 \
    --bc-updates "${BC_UPDATES}" \
    --bc-start "${BC_START}" \
    --bc-end "${BC_END}" \
    --lr 2e-5 \
    --clip 0.15 \
    --entropy 0.002 \
    --target-kl 0.012 \
    --lam 0.95 \
    --local-prob "${LOCAL_PROB}" \
    --self-prob "${SELF_PROB}" \
    --eval-every 10 \
    --eval-games 200 \
    --eval-seed "${EVAL_SEED}" \
    --skip-baselines \
    --seed "${SEED}" \
    ${RESUME_FLAG} \
    --out "${ROUND_OUT}" 2>&1 | tee "${ROUND_LOG}"

if grep -q "Saved best evaluation score=" "${ROUND_LOG}"; then
    NEW_BEST=$(grep "Saved best evaluation score=" "${ROUND_LOG}" | tail -n 1 | sed -E 's/.*score=([-0-9.]+).*/\1/')
    cp -f "${ROUND_OUT}.best.pt" "${BEST_CKPT}"
    echo "${NEW_BEST}" > "${BEST_SCORE_FILE}"
    echo "0" > "${STREAK_FILE}"
    echo "[$(date -Is)] Round ${ROUND} IMPROVED! Promoted new best checkpoint (score=${NEW_BEST} > ${PREV_BEST})."
    "${PY_BIN}" export_onnx.py --ckpt "${BEST_CKPT}" --out "${BASE_DIR}/hk_mahjong_agent_v8.onnx"
    cp -f "${BASE_DIR}/hk_mahjong_agent_v8.onnx" "${BASE_DIR}/hk_mahjong_agent.onnx"
    cp -f "${BASE_DIR}/hk_mahjong_agent_v8.onnx.data" "${BASE_DIR}/hk_mahjong_agent.onnx.data"
else
    STREAK=$((STREAK + 1))
    echo "${STREAK}" > "${STREAK_FILE}"
    echo "[$(date -Is)] Round ${ROUND} did not beat ${PREV_BEST}. No-improvement streak: ${STREAK}/${MAX_NO_IMPROVE}."
fi

NEXT_ROUND=$((ROUND + 1))
echo "${NEXT_ROUND}" > "${ROUND_FILE}"

if [ "${STREAK}" -ge "${MAX_NO_IMPROVE}" ]; then
    echo "[$(date -Is)] Reached ${MAX_NO_IMPROVE} consecutive rounds with no improvement. Marking CONVERGED at score=${PREV_BEST}."
    echo "Converged at $(date -Is) with best_score=${PREV_BEST}" > "${CONVERGED_FLAG}"
fi

