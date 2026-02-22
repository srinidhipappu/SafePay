"""
SafePay Family - Risk Scoring API (FastAPI)
Real-time transaction risk scoring endpoint.

POST /score  → returns risk score + explanation flags
GET  /health → health check
GET  /model-info → model metadata

Install: pip install fastapi uvicorn
Run:     uvicorn api:app --reload --port 8001
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
import numpy as np
import pandas as pd
import joblib
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from features import engineer_features, FEATURE_COLUMNS, HIGH_RISK_MCCS, NORMAL_SENIOR_MCCS

# --- Load models at startup ---
MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "models")

def load_models():
    try:
        iso      = joblib.load(os.path.join(MODEL_DIR, "isolation_forest.pkl"))
        lr       = joblib.load(os.path.join(MODEL_DIR, "logistic_regression.pkl"))
        scaler   = joblib.load(os.path.join(MODEL_DIR, "scaler.pkl"))
        baselines = joblib.load(os.path.join(MODEL_DIR, "baselines.pkl"))
        with open(os.path.join(MODEL_DIR, "feature_importance.json")) as f:
            feature_importance = json.load(f)
        with open(os.path.join(MODEL_DIR, "anomaly_score_range.json")) as f:
            score_range = json.load(f)
        return iso, lr, scaler, baselines, feature_importance, score_range
    except FileNotFoundError as e:
        print(f"⚠️  Models not found: {e}")
        print("   Run python train.py first!")
        return None, None, None, None, None, None

iso, lr, scaler, baselines, feature_importance, score_range = load_models()

app = FastAPI(
    title="SafePay Family - Risk Scoring API",
    description="Real-time fraud risk scoring for senior financial protection",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Request / Response Models ---

class TransactionRequest(BaseModel):
    transaction_id: str = Field(..., example="txn_123456")
    user_id: str        = Field(..., example="sr_001")
    amount: float       = Field(..., gt=0, example=450.00)
    merchant: str       = Field(..., example="CoinFlip ATM")
    mcc: str            = Field(..., example="6051")
    timestamp: str      = Field(..., example="2024-01-15T02:30:00")
    city: str           = Field(..., example="Unknown City")
    device_id: Optional[str] = None

class RiskFlag(BaseModel):
    flag: str
    description: str
    severity: str  # "high", "medium", "low"

class ScoreResponse(BaseModel):
    transaction_id: str
    user_id: str
    risk_score: float               # 0.0 – 1.0
    risk_level: str                 # "LOW", "MEDIUM", "HIGH", "CRITICAL"
    anomaly_score: float
    fraud_probability: float
    risk_flags: List[RiskFlag]
    triggered_features: dict
    gemini_prompt_context: dict     # Pre-built context for Gemini call
    recommendation: str
    scored_at: str


def normalize_single_anomaly(score: float, reference_scores: np.ndarray) -> float:
    """Normalize a single anomaly score relative to training distribution."""
    flipped = -score
    ref_flipped = -reference_scores
    min_s, max_s = ref_flipped.min(), ref_flipped.max()
    if max_s == min_s:
        return 0.5
    return float(np.clip((flipped - min_s) / (max_s - min_s), 0, 1))


def score_transaction(txn: TransactionRequest) -> ScoreResponse:
    """Core scoring logic."""

    if iso is None:
        raise HTTPException(status_code=503, detail="Models not loaded. Run training first.")

    # Build a mini-DataFrame for feature engineering
    txn_dict = txn.dict()
    txn_dict["authorized"] = True
    txn_df = pd.DataFrame([txn_dict])
    txn_df["timestamp"] = pd.to_datetime(txn_df["timestamp"])

    # Get user baseline or use defaults
    user_baseline = baselines.get(txn.user_id)
    if user_baseline is None:
        # New user — use conservative defaults
        user_baseline = {
            "mean_amount":    txn.amount,
            "std_amount":     txn.amount * 0.3,
            "median_amount":  txn.amount,
            "p95_amount":     txn.amount * 2,
            "known_merchants": set(),
            "known_mccs":      set(),
            "known_cities":    set(),
            "normal_hours":    {},
            "total_txns":      0,
        }

    # Feature engineering
    feature_row = engineer_features(txn_df, {txn.user_id: user_baseline}).iloc[0]
    X = np.array([feature_row[FEATURE_COLUMNS].values], dtype=float)

    # --- Anomaly Score (normalized using training data range) ---
    raw_anomaly = iso.score_samples(X)[0]
    s_min = score_range["min"]
    s_max = score_range["max"]
    # More negative = more anomalous; normalize so min→1.0, max→0.0
    anomaly_score = float(np.clip((raw_anomaly - s_max) / (s_min - s_max), 0, 1))

    # --- Fraud Probability ---
    X_scaled    = scaler.transform(X)
    fraud_prob  = float(lr.predict_proba(X_scaled)[0][1])

    # --- Final Risk Score ---
    risk_score = round(0.6 * anomaly_score + 0.4 * fraud_prob, 4)

    # --- Risk Level ---
    if risk_score >= 0.75:
        risk_level = "CRITICAL"
    elif risk_score >= 0.5:
        risk_level = "HIGH"
    elif risk_score >= 0.3:
        risk_level = "MEDIUM"
    else:
        risk_level = "LOW"

    # --- Build Risk Flags ---
    flags = []
    baseline = user_baseline
    mean_amt = baseline["mean_amount"]

    if feature_row["amount_ratio"] > 3:
        flags.append(RiskFlag(
            flag="LARGE_AMOUNT",
            description=f"Transaction is {feature_row['amount_ratio']:.1f}x your usual spending (avg: ${mean_amt:.0f})",
            severity="high"
        ))
    elif feature_row["amount_ratio"] > 1.5:
        flags.append(RiskFlag(
            flag="ABOVE_AVERAGE_AMOUNT",
            description=f"Transaction is {feature_row['amount_ratio']:.1f}x your usual spending",
            severity="medium"
        ))

    if feature_row["is_new_merchant"]:
        flags.append(RiskFlag(
            flag="NEW_MERCHANT",
            description=f"First transaction with '{txn.merchant}'",
            severity="medium"
        ))

    if feature_row["is_high_risk_mcc"]:
        mcc_names = {
            "6051": "Gift Cards/Cryptocurrency",
            "7995": "Gambling",
            "6012": "Unusual Financial Transfer",
            "4814": "Telecom (scam-associated)",
        }
        flags.append(RiskFlag(
            flag="HIGH_RISK_CATEGORY",
            description=f"Merchant category: {mcc_names.get(txn.mcc, 'High-risk category')} — frequently used in scams targeting seniors",
            severity="high"
        ))

    if feature_row["is_new_city"]:
        flags.append(RiskFlag(
            flag="NEW_LOCATION",
            description=f"Transaction in '{txn.city}' — not in your usual locations",
            severity="high"
        ))

    if feature_row["is_unusual_hour"]:
        hour = pd.to_datetime(txn.timestamp).hour
        flags.append(RiskFlag(
            flag="UNUSUAL_TIME",
            description=f"Transaction at {hour}:00 AM — outside your normal activity hours",
            severity="medium"
        ))

    if feature_row["velocity_1h"] >= 3:
        flags.append(RiskFlag(
            flag="HIGH_VELOCITY",
            description=f"{feature_row['velocity_1h']} transactions in the last hour — unusual activity burst",
            severity="high"
        ))

    # --- Triggered features for Gemini ---
    triggered_features = {
        col: float(feature_row[col])
        for col in FEATURE_COLUMNS
        if feature_row[col] != 0
    }

    # --- Gemini prompt context (pre-built for Node backend) ---
    gemini_context = {
        "transaction": {
            "merchant":  txn.merchant,
            "amount":    txn.amount,
            "city":      txn.city,
            "timestamp": txn.timestamp,
            "mcc":       txn.mcc,
        },
        "user_baseline": {
            "average_spend":    round(mean_amt, 2),
            "amount_ratio":     round(float(feature_row["amount_ratio"]), 2),
            "total_past_txns":  baseline.get("total_txns", 0),
        },
        "risk": {
            "score":       risk_score,
            "level":       risk_level,
            "flags":       [f.flag for f in flags],
        },
        "prompt_template": (
            f"A transaction was flagged for a senior customer. "
            f"Transaction: ${txn.amount:.2f} at '{txn.merchant}' in {txn.city}. "
            f"This is {feature_row['amount_ratio']:.1f}x their normal spending. "
            f"Risk flags: {', '.join([f.flag for f in flags]) or 'none'}. "
            f"Risk score: {risk_score:.2f}/1.0 ({risk_level}). "
            f"Respond ONLY with JSON: {{\"summary\": \"...\", \"reasons\": [\"...\"], \"action\": \"...\"}}"
        )
    }

    # --- Recommendation ---
    if risk_level == "CRITICAL":
        recommendation = "Block and require family approval before proceeding"
    elif risk_level == "HIGH":
        recommendation = "Alert family circle and ask senior to confirm"
    elif risk_level == "MEDIUM":
        recommendation = "Flag for review — notify senior only"
    else:
        recommendation = "Approve — normal spending pattern"

    return ScoreResponse(
        transaction_id=txn.transaction_id,
        user_id=txn.user_id,
        risk_score=risk_score,
        risk_level=risk_level,
        anomaly_score=round(anomaly_score, 4),
        fraud_probability=round(fraud_prob, 4),
        risk_flags=flags,
        triggered_features=triggered_features,
        gemini_prompt_context=gemini_context,
        recommendation=recommendation,
        scored_at=datetime.utcnow().isoformat(),
    )


# --- API Routes ---

@app.get("/health")
def health():
    return {
        "status": "ok" if iso is not None else "models_not_loaded",
        "models_loaded": iso is not None,
        "timestamp": datetime.utcnow().isoformat(),
    }

@app.post("/score", response_model=ScoreResponse)
def score(txn: TransactionRequest):
    """Score a transaction and return risk assessment."""
    return score_transaction(txn)

@app.get("/model-info")
def model_info():
    return {
        "features": FEATURE_COLUMNS,
        "feature_count": len(FEATURE_COLUMNS),
        "top_fraud_indicators": list(feature_importance.keys())[:5] if feature_importance else [],
        "risk_weights": {
            "anomaly_score": 0.6,
            "fraud_probability": 0.4,
        },
        "risk_thresholds": {
            "LOW":      "< 0.30",
            "MEDIUM":   "0.30 – 0.50",
            "HIGH":     "0.50 – 0.75",
            "CRITICAL": "> 0.75",
        }
    }

@app.get("/users/{user_id}/baseline")
def get_user_baseline(user_id: str):
    """Get a user's behavioral baseline."""
    baseline = baselines.get(user_id)
    if not baseline:
        raise HTTPException(status_code=404, detail=f"No baseline found for user {user_id}")
    return {
        "user_id": user_id,
        "mean_amount":   round(baseline["mean_amount"], 2),
        "std_amount":    round(baseline["std_amount"], 2),
        "p95_amount":    round(baseline["p95_amount"], 2),
        "known_cities":  list(baseline["known_cities"]),
        "known_mccs":    list(baseline["known_mccs"]),
        "total_txns":    baseline["total_txns"],
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:app", host="0.0.0.0", port=8001, reload=True)
