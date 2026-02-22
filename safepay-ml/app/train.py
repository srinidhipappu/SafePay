"""
SafePay Family - ML Model Training Pipeline
Hybrid system:
  1. Isolation Forest → Anomaly score (unsupervised, per-user baseline)
  2. Logistic Regression → Fraud probability (supervised, uses labels)
  3. Final Risk Score = 0.6 × anomaly + 0.4 × fraud_prob

Run this once to train + save models.
"""

import pandas as pd
import numpy as np
import joblib
import json
import os
import sys

from sklearn.ensemble import IsolationForest
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    classification_report, roc_auc_score,
    precision_recall_curve, confusion_matrix
)

# Add parent dir to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from features import engineer_features, FEATURE_COLUMNS, build_user_baselines

# --- Config ---
MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "models")
ANOMALY_THRESHOLD = 0.5   # Isolation Forest contamination estimate
RISK_WEIGHT_ANOMALY = 0.6
RISK_WEIGHT_FRAUD   = 0.4


def train_isolation_forest(X_train: np.ndarray, contamination: float = 0.07):
    """
    Train Isolation Forest for anomaly detection.
    contamination = estimated % of anomalies in data (~7% for fraud datasets)
    """
    print("🌲 Training Isolation Forest...")
    iso = IsolationForest(
        n_estimators=200,
        contamination=contamination,
        max_samples="auto",
        random_state=42,
        n_jobs=-1,
    )
    iso.fit(X_train)
    print("   ✅ Isolation Forest trained")
    return iso


def train_logistic_regression(X_train, y_train, X_test, y_test):
    """
    Train Logistic Regression fraud classifier.
    Uses class_weight='balanced' to handle fraud class imbalance.
    """
    print("📊 Training Logistic Regression...")
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled  = scaler.transform(X_test)

    lr = LogisticRegression(
        class_weight="balanced",
        max_iter=1000,
        C=0.5,
        random_state=42,
    )
    lr.fit(X_train_scaled, y_train)

    # Evaluate
    y_pred  = lr.predict(X_test_scaled)
    y_proba = lr.predict_proba(X_test_scaled)[:, 1]
    auc     = roc_auc_score(y_test, y_proba)

    print(f"   ✅ LR AUC-ROC: {auc:.3f}")
    print(classification_report(y_test, y_pred, target_names=["Normal", "Fraud"]))

    return lr, scaler


def compute_risk_score(anomaly_score: float, fraud_prob: float) -> float:
    """
    Combine anomaly score and fraud probability into final 0–1 risk score.
    anomaly_score: from Isolation Forest (normalized to 0–1)
    fraud_prob:    from Logistic Regression (.predict_proba)
    """
    raw = (RISK_WEIGHT_ANOMALY * anomaly_score) + (RISK_WEIGHT_FRAUD * fraud_prob)
    return round(min(max(raw, 0.0), 1.0), 4)


def normalize_anomaly_scores(scores: np.ndarray) -> np.ndarray:
    """
    Convert Isolation Forest raw scores to 0–1 range.
    Raw scores are negative; more negative = more anomalous.
    """
    # Flip: more negative raw score → higher anomaly score
    flipped = -scores
    min_s, max_s = flipped.min(), flipped.max()
    if max_s == min_s:
        return np.zeros_like(flipped)
    return (flipped - min_s) / (max_s - min_s)


def evaluate_final_risk(feature_df, iso, lr, scaler, threshold=0.5):
    """Run full pipeline evaluation on labeled data."""
    X = feature_df[FEATURE_COLUMNS].values
    y = feature_df["is_fraud"].values

    # Anomaly scores
    raw_anomaly = iso.score_samples(X)
    anomaly_scores = normalize_anomaly_scores(raw_anomaly)

    # Fraud probabilities
    X_scaled  = scaler.transform(X)
    fraud_probs = lr.predict_proba(X_scaled)[:, 1]

    # Final risk scores
    risk_scores = np.array([
        compute_risk_score(a, f)
        for a, f in zip(anomaly_scores, fraud_probs)
    ])

    # Classify at threshold
    predictions = (risk_scores >= threshold).astype(int)

    print(f"\n🎯 Final Risk Score Evaluation (threshold={threshold})")
    print(classification_report(y, predictions, target_names=["Normal", "Fraud"]))

    cm = confusion_matrix(y, predictions)
    tn, fp, fn, tp = cm.ravel()
    print(f"   True Positives (caught fraud):    {tp}")
    print(f"   False Positives (false alarms):   {fp}")
    print(f"   False Negatives (missed fraud):   {fn}")
    print(f"   True Negatives (correct clears):  {tn}")
    print(f"   Fraud Detection Rate: {tp / (tp+fn):.1%}")
    print(f"   False Alarm Rate:     {fp / (fp+tn):.1%}")

    return risk_scores


def main():
    os.makedirs(MODEL_DIR, exist_ok=True)

    # --- Load data ---
    data_path = os.path.join(os.path.dirname(__file__), "..", "data", "transactions.csv")
    if not os.path.exists(data_path):
        print("⚠️  No transactions.csv found. Run generate_data.py first.")
        print("   Generating synthetic data now...")
        os.chdir(os.path.join(os.path.dirname(__file__), "..", "data"))
        import subprocess
        subprocess.run(["python3", "generate_data.py"])
        os.chdir(os.path.dirname(__file__))

    print("📂 Loading transaction data...")
    df = pd.read_csv(data_path)
    print(f"   {len(df)} transactions loaded")

    # --- Feature Engineering ---
    print("\n⚙️  Engineering features...")
    baselines = build_user_baselines(df)
    feature_df = engineer_features(df, baselines)

    X = feature_df[FEATURE_COLUMNS].values
    y = feature_df["is_fraud"].values

    # --- Train/Test Split ---
    X_train, X_test, y_train, y_test, idx_train, idx_test = train_test_split(
        X, y, feature_df.index, test_size=0.2, stratify=y, random_state=42
    )

    # --- Train Models ---
    print("\n🚀 Training models...")
    iso    = train_isolation_forest(X_train, contamination=0.07)
    lr, scaler = train_logistic_regression(X_train, y_train, X_test, y_test)

    # --- Evaluate Full Pipeline ---
    evaluate_final_risk(feature_df.loc[idx_test], iso, lr, scaler)

    # --- Save Models + Artifacts ---
    print("\n💾 Saving models...")
    joblib.dump(iso,     os.path.join(MODEL_DIR, "isolation_forest.pkl"))
    joblib.dump(lr,      os.path.join(MODEL_DIR, "logistic_regression.pkl"))
    joblib.dump(scaler,  os.path.join(MODEL_DIR, "scaler.pkl"))
    joblib.dump(baselines, os.path.join(MODEL_DIR, "baselines.pkl"))

    # Save feature column order (important for inference)
    with open(os.path.join(MODEL_DIR, "feature_columns.json"), "w") as f:
        json.dump(FEATURE_COLUMNS, f)

    # Save feature importances for explainability
    feature_importance = dict(zip(
        FEATURE_COLUMNS,
        [abs(c) for c in lr.coef_[0]]
    ))
    feature_importance_sorted = dict(
        sorted(feature_importance.items(), key=lambda x: x[1], reverse=True)
    )
    with open(os.path.join(MODEL_DIR, "feature_importance.json"), "w") as f:
        json.dump(feature_importance_sorted, f, indent=2)

    print("\n✅ All models saved:")
    print(f"   {MODEL_DIR}/isolation_forest.pkl")
    print(f"   {MODEL_DIR}/logistic_regression.pkl")
    print(f"   {MODEL_DIR}/scaler.pkl")
    print(f"   {MODEL_DIR}/baselines.pkl")
    print(f"   {MODEL_DIR}/feature_columns.json")
    print(f"   {MODEL_DIR}/feature_importance.json")
    print("\n🎉 Training complete! Run api.py to start the scoring service.")


if __name__ == "__main__":
    main()
