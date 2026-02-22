"""
SafePay Family - Risk Scoring API (FastAPI)
Real-time transaction risk scoring endpoint.

POST /score         → returns risk score + explanation flags
POST /detect-scam   → returns scam/legit classification + confidence
GET  /health        → health check
GET  /model-info    → model metadata

Install: pip install fastapi uvicorn scikit-learn
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
from scam_detector import extract_text_features, train_model

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

def load_scam_model():
    scam_path = os.path.join(MODEL_DIR, "scam_detector.pkl")
    if os.path.exists(scam_path):
        return joblib.load(scam_path)
    else:
        print("⚠️  Scam model not found — training now...")
        return train_model()

iso, lr, scaler, baselines, feature_importance, score_range = load_models()
scam_pipeline = load_scam_model()

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


# ─── Request / Response Models ────────────────────────────────────────────────

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
    severity: str

class ScoreResponse(BaseModel):
    transaction_id: str
    user_id: str
    risk_score: float
    risk_level: str
    anomaly_score: float
    fraud_probability: float
    risk_flags: List[RiskFlag]
    triggered_features: dict
    gemini_prompt_context: dict
    recommendation: str
    scored_at: str

class ScamDetectRequest(BaseModel):
    email_address: Optional[str] = Field(None, example="noreply@paypa1-secure.com")
    email_body: Optional[str]    = Field(None, example="You have won a $1000 prize click here")
    sms_content: Optional[str]   = Field(None, example="URGENT your account is suspended verify now")
    phone_number: Optional[str]  = Field(None, example="1-800-555-0199")

class ScamSignal(BaseModel):
    name: str
    detected: bool
    description: str

class ScamDetectResponse(BaseModel):
    label: str              # "SCAM" | "SAFE"
    confidence: float       # 0.0 – 1.0
    confidence_pct: str     # "87.4%"
    risk_level: str         # "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
    signals: List[ScamSignal]
    summary: str
    analyzed_at: str


# ─── Scam Detection Logic ─────────────────────────────────────────────────────

SIGNAL_DESCRIPTIONS = {
    "has_urgency":            "Urgency language detected (e.g. 'act now', 'expires today')",
    "has_prize":              "Prize or reward language detected (e.g. 'you won', 'free gift')",
    "has_threat":             "Threatening language detected (e.g. 'arrest', 'suspended', 'locked')",
    "has_money":              "Suspicious payment method mentioned (e.g. gift cards, wire transfer, crypto)",
    "has_suspicious_tld":     "Suspicious domain or URL pattern detected",
    "has_typosquat":          "Known brand name misspelled (typosquatting attempt)",
    "has_gov_impersonation":  "Government agency impersonation detected (IRS, SSA, Medicare)",
    "asks_for_credentials":   "Requests sensitive information (password, SSN, bank details)",
}

@app.post("/detect-scam", response_model=ScamDetectResponse)
def detect_scam(req: ScamDetectRequest):
    """Classify whether a message/contact is a scam using TF-IDF + Logistic Regression."""

    # Require at least one field
    if not any([req.email_address, req.email_body, req.sms_content, req.phone_number]):
        raise HTTPException(status_code=400, detail="At least one input field is required.")

    combined_text, signal_flags = extract_text_features(
        email_address=req.email_address,
        email_body=req.email_body,
        sms_content=req.sms_content,
        phone_number=req.phone_number,
    )

    # Predict
    proba       = scam_pipeline.predict_proba([combined_text])[0]
    scam_prob   = float(proba[1])
    label       = "SCAM" if scam_prob >= 0.5 else "SAFE"

    # Boost confidence if multiple signals fire
    signal_count = sum(v for k, v in signal_flags.items() if k != "is_empty")
    if signal_count >= 3 and label == "SCAM":
        scam_prob = min(scam_prob * 1.1, 0.99)
    elif signal_count == 0 and label == "SAFE":
        scam_prob = max(scam_prob * 0.9, 0.01)

    confidence = scam_prob if label == "SCAM" else (1 - scam_prob)

    # Risk level
    if scam_prob >= 0.85:
        risk_level = "CRITICAL"
    elif scam_prob >= 0.65:
        risk_level = "HIGH"
    elif scam_prob >= 0.45:
        risk_level = "MEDIUM"
    else:
        risk_level = "LOW"

    # Build signals list
    signals = [
        ScamSignal(
            name=key.replace("has_", "").replace("_", " ").title(),
            detected=bool(val),
            description=SIGNAL_DESCRIPTIONS.get(key, key),
        )
        for key, val in signal_flags.items()
        if key != "is_empty"
    ]

    # Summary
    detected_signals = [s.name for s in signals if s.detected]
    if label == "SCAM":
        if detected_signals:
            summary = f"This appears to be a scam. Detected signals: {', '.join(detected_signals)}."
        else:
            summary = "This content has characteristics consistent with scam messages."
    else:
        summary = "No significant scam indicators detected. This appears to be legitimate."

    return ScamDetectResponse(
        label=label,
        confidence=round(confidence, 4),
        confidence_pct=f"{confidence * 100:.1f}%",
        risk_level=risk_level,
        signals=signals,
        summary=summary,
        analyzed_at=datetime.utcnow().isoformat(),
    )


# ─── Existing Routes ──────────────────────────────────────────────────────────

def normalize_single_anomaly(score: float, reference_scores: np.ndarray) -> float:
    flipped = -score
    ref_flipped = -reference_scores
    min_s, max_s = ref_flipped.min(), ref_flipped.max()
    if max_s == min_s:
        return 0.5
    return float(np.clip((flipped - min_s) / (max_s - min_s), 0, 1))


def score_transaction(txn: TransactionRequest) -> ScoreResponse:
    if iso is None:
        raise HTTPException(status_code=503, detail="Models not loaded. Run training first.")

    txn_dict = txn.dict()
    txn_dict["authorized"] = True
    txn_df = pd.DataFrame([txn_dict])
    txn_df["timestamp"] = pd.to_datetime(txn_df["timestamp"])

    user_baseline = baselines.get(txn.user_id)
    if user_baseline is None:
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

    feature_row = engineer_features(txn_df, {txn.user_id: user_baseline}).iloc[0]
    X = np.array([feature_row[FEATURE_COLUMNS].values], dtype=float)

    raw_anomaly = iso.score_samples(X)[0]
    s_min = score_range["min"]
    s_max = score_range["max"]
    anomaly_score = float(np.clip((raw_anomaly - s_max) / (s_min - s_max), 0, 1))

    X_scaled   = scaler.transform(X)
    fraud_prob = float(lr.predict_proba(X_scaled)[0][1])

    risk_score = round(0.6 * anomaly_score + 0.4 * fraud_prob, 4)

    if risk_score >= 0.75:
        risk_level = "CRITICAL"
    elif risk_score >= 0.5:
        risk_level = "HIGH"
    elif risk_score >= 0.3:
        risk_level = "MEDIUM"
    else:
        risk_level = "LOW"

    flags = []
    baseline = user_baseline
    mean_amt = baseline["mean_amount"]

    if feature_row["amount_ratio"] > 3:
        flags.append(RiskFlag(flag="LARGE_AMOUNT", description=f"Transaction is {feature_row['amount_ratio']:.1f}x your usual spending (avg: ${mean_amt:.0f})", severity="high"))
    elif feature_row["amount_ratio"] > 1.5:
        flags.append(RiskFlag(flag="ABOVE_AVERAGE_AMOUNT", description=f"Transaction is {feature_row['amount_ratio']:.1f}x your usual spending", severity="medium"))
    if feature_row["is_new_merchant"]:
        flags.append(RiskFlag(flag="NEW_MERCHANT", description=f"First transaction with '{txn.merchant}'", severity="medium"))
    if feature_row["is_high_risk_mcc"]:
        mcc_names = {"6051": "Gift Cards/Cryptocurrency", "7995": "Gambling", "6012": "Unusual Financial Transfer", "4814": "Telecom (scam-associated)"}
        flags.append(RiskFlag(flag="HIGH_RISK_CATEGORY", description=f"Merchant category: {mcc_names.get(txn.mcc, 'High-risk category')} — frequently used in scams targeting seniors", severity="high"))
    if feature_row["is_new_city"]:
        flags.append(RiskFlag(flag="NEW_LOCATION", description=f"Transaction in '{txn.city}' — not in your usual locations", severity="high"))
    if feature_row["is_unusual_hour"]:
        hour = pd.to_datetime(txn.timestamp).hour
        flags.append(RiskFlag(flag="UNUSUAL_TIME", description=f"Transaction at {hour}:00 AM — outside your normal activity hours", severity="medium"))
    if feature_row["velocity_1h"] >= 3:
        flags.append(RiskFlag(flag="HIGH_VELOCITY", description=f"{feature_row['velocity_1h']} transactions in the last hour", severity="high"))

    triggered_features = {col: float(feature_row[col]) for col in FEATURE_COLUMNS if feature_row[col] != 0}

    gemini_context = {
        "transaction": {"merchant": txn.merchant, "amount": txn.amount, "city": txn.city, "timestamp": txn.timestamp, "mcc": txn.mcc},
        "user_baseline": {"average_spend": round(mean_amt, 2), "amount_ratio": round(float(feature_row["amount_ratio"]), 2), "total_past_txns": baseline.get("total_txns", 0)},
        "risk": {"score": risk_score, "level": risk_level, "flags": [f.flag for f in flags]},
        "prompt_template": (
            f"A transaction was flagged for a senior customer. "
            f"Transaction: ${txn.amount:.2f} at '{txn.merchant}' in {txn.city}. "
            f"Risk score: {risk_score:.2f}/1.0 ({risk_level}). "
            f"Respond ONLY with JSON: {{\"summary\": \"...\", \"reasons\": [\"...\"], \"action\": \"...\"}}"
        )
    }

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


@app.get("/health")
def health():
    return {
        "status": "ok" if iso is not None else "models_not_loaded",
        "models_loaded": iso is not None,
        "scam_model_loaded": scam_pipeline is not None,
        "timestamp": datetime.utcnow().isoformat(),
    }

@app.post("/score", response_model=ScoreResponse)
def score(txn: TransactionRequest):
    return score_transaction(txn)

@app.get("/model-info")
def model_info():
    return {
        "features": FEATURE_COLUMNS,
        "feature_count": len(FEATURE_COLUMNS),
        "top_fraud_indicators": list(feature_importance.keys())[:5] if feature_importance else [],
        "risk_weights": {"anomaly_score": 0.6, "fraud_probability": 0.4},
        "risk_thresholds": {"LOW": "< 0.30", "MEDIUM": "0.30 – 0.50", "HIGH": "0.50 – 0.75", "CRITICAL": "> 0.75"},
    }

@app.get("/users/{user_id}/baseline")
def get_user_baseline(user_id: str):
    baseline = baselines.get(user_id)
    if not baseline:
        raise HTTPException(status_code=404, detail=f"No baseline found for user {user_id}")
    return {
        "user_id": user_id,
        "mean_amount":  round(baseline["mean_amount"], 2),
        "std_amount":   round(baseline["std_amount"], 2),
        "p95_amount":   round(baseline["p95_amount"], 2),
        "known_cities": list(baseline["known_cities"]),
        "known_mccs":   list(baseline["known_mccs"]),
        "total_txns":   baseline["total_txns"],
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:app", host="0.0.0.0", port=8001, reload=True)