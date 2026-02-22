"""
SafePay Family - Feature Engineering Pipeline
Transforms raw Fiserv-style transactions into ML-ready features.

Features are designed around senior behavioral patterns:
- How much they normally spend
- Where they normally shop
- When they normally transact
- How fast they're spending
"""

import pandas as pd
import numpy as np
from datetime import datetime


# MCCs considered high-risk for seniors
HIGH_RISK_MCCS = {"6051", "7995", "6012", "4814", "6010", "6011"}

# MCCs seniors commonly use (low suspicion)
NORMAL_SENIOR_MCCS = {"5411", "5912", "5812", "4111", "7011", "5311", "5541", "8011"}


def build_user_baselines(df: pd.DataFrame) -> dict:
    """
    Build per-user behavioral baselines from historical data.
    Returns a dict keyed by user_id with their spending profile.
    """
    baselines = {}

    df = df.copy()
    df["timestamp"] = pd.to_datetime(df["timestamp"])

    for user_id, user_df in df.groupby("user_id"):
        # Only use non-fraud labeled data for baseline (or all if no labels)
        if "is_fraud" in user_df.columns:
            baseline_df = user_df[user_df["is_fraud"] == 0]
        else:
            baseline_df = user_df

        if len(baseline_df) == 0:
            baseline_df = user_df

        amounts = baseline_df["amount"]
        baselines[user_id] = {
            "mean_amount":    amounts.mean(),
            "std_amount":     amounts.std() if amounts.std() > 0 else 1.0,
            "median_amount":  amounts.median(),
            "p95_amount":     amounts.quantile(0.95),
            "known_merchants": set(baseline_df["merchant"].unique()),
            "known_mccs":      set(baseline_df["mcc"].unique()),
            "known_cities":    set(baseline_df["city"].unique()),
            "normal_hours":    baseline_df["timestamp"].dt.hour.value_counts().to_dict(),
            "total_txns":      len(baseline_df),
        }

    return baselines


def engineer_features(df: pd.DataFrame, baselines: dict = None) -> pd.DataFrame:
    """
    Main feature engineering function.
    Takes raw transaction DataFrame, returns feature matrix.
    """
    df = df.copy()
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df = df.sort_values(["user_id", "timestamp"]).reset_index(drop=True)

    # Build baselines if not provided
    if baselines is None:
        baselines = build_user_baselines(df)

    features = []

    for idx, row in df.iterrows():
        user_id = row["user_id"]
        baseline = baselines.get(user_id, {})

        # --- Amount Features ---
        mean_amt = baseline.get("mean_amount", row["amount"])
        std_amt  = baseline.get("std_amount", 1.0)

        amount_ratio  = row["amount"] / mean_amt if mean_amt > 0 else 1.0
        amount_zscore = (row["amount"] - mean_amt) / std_amt

        is_above_p95  = 1 if row["amount"] > baseline.get("p95_amount", float("inf")) else 0

        # Rolling 7-day spend for this user (look back only)
        past_7d = df[
            (df["user_id"] == user_id) &
            (df["timestamp"] < row["timestamp"]) &
            (df["timestamp"] >= row["timestamp"] - pd.Timedelta(days=7))
        ]
        rolling_7d_total = past_7d["amount"].sum()
        rolling_7d_count = len(past_7d)

        # --- Merchant / MCC Features ---
        known_merchants = baseline.get("known_merchants", set())
        known_mccs      = baseline.get("known_mccs", set())

        is_new_merchant = 0 if row["merchant"] in known_merchants else 1
        is_new_mcc      = 0 if row["mcc"] in known_mccs else 1
        is_high_risk_mcc = 1 if row["mcc"] in HIGH_RISK_MCCS else 0
        is_normal_senior_mcc = 1 if row["mcc"] in NORMAL_SENIOR_MCCS else 0

        # MCC frequency score: how often has user used this MCC?
        user_mcc_history = df[
            (df["user_id"] == user_id) &
            (df["timestamp"] < row["timestamp"])
        ]["mcc"].value_counts()

        total_past = user_mcc_history.sum()
        mcc_freq_score = (
            user_mcc_history.get(row["mcc"], 0) / total_past
            if total_past > 0 else 0.0
        )

        # --- Time Features ---
        hour    = row["timestamp"].hour
        weekday = row["timestamp"].weekday()  # 0=Monday

        is_weekend      = 1 if weekday >= 5 else 0
        is_unusual_hour = 1 if hour in range(1, 5) else 0  # 1AM–5AM

        # Is this hour unusual for this specific user?
        normal_hours = baseline.get("normal_hours", {})
        total_hour_txns = sum(normal_hours.values()) or 1
        hour_prob = normal_hours.get(hour, 0) / total_hour_txns
        is_unusual_for_user = 1 if hour_prob < 0.02 else 0

        # Transaction velocity: how many txns in last 1 hour?
        last_1h = df[
            (df["user_id"] == user_id) &
            (df["timestamp"] < row["timestamp"]) &
            (df["timestamp"] >= row["timestamp"] - pd.Timedelta(hours=1))
        ]
        velocity_1h = len(last_1h)

        # --- Location Features ---
        known_cities = baseline.get("known_cities", set())
        is_new_city  = 0 if row["city"] in known_cities else 1

        # --- Combined Risk Signals ---
        # Multiple risk flags at once is a strong signal
        risk_signal_count = (
            is_new_merchant +
            is_new_mcc +
            is_high_risk_mcc +
            is_unusual_hour +
            is_new_city +
            is_above_p95
        )

        features.append({
            # Identifiers (not used in model)
            "transaction_id":      row["transaction_id"],
            "user_id":             user_id,
            "timestamp":           row["timestamp"],
            "amount":              row["amount"],
            "merchant":            row["merchant"],
            "mcc":                 row["mcc"],
            "city":                row["city"],

            # Amount features
            "amount_ratio":        round(amount_ratio, 4),
            "amount_zscore":       round(amount_zscore, 4),
            "is_above_p95":        is_above_p95,
            "rolling_7d_total":    round(rolling_7d_total, 2),
            "rolling_7d_count":    rolling_7d_count,

            # Merchant/MCC features
            "is_new_merchant":     is_new_merchant,
            "is_new_mcc":          is_new_mcc,
            "is_high_risk_mcc":    is_high_risk_mcc,
            "is_normal_senior_mcc": is_normal_senior_mcc,
            "mcc_freq_score":      round(mcc_freq_score, 4),

            # Time features
            "hour_of_day":         hour,
            "is_weekend":          is_weekend,
            "is_unusual_hour":     is_unusual_hour,
            "is_unusual_for_user": is_unusual_for_user,
            "velocity_1h":         velocity_1h,

            # Location features
            "is_new_city":         is_new_city,

            # Combined signals
            "risk_signal_count":   risk_signal_count,

            # Label (if available)
            **({"is_fraud": row["is_fraud"]} if "is_fraud" in row else {}),
        })

    feature_df = pd.DataFrame(features)
    print(f"✅ Engineered {len(feature_df)} feature rows with {len(FEATURE_COLUMNS)} ML features")
    return feature_df


# Columns used for ML model training (exclude identifiers and label)
FEATURE_COLUMNS = [
    "amount_ratio",
    "amount_zscore",
    "is_above_p95",
    "rolling_7d_total",
    "rolling_7d_count",
    "is_new_merchant",
    "is_new_mcc",
    "is_high_risk_mcc",
    "is_normal_senior_mcc",
    "mcc_freq_score",
    "hour_of_day",
    "is_weekend",
    "is_unusual_hour",
    "is_unusual_for_user",
    "velocity_1h",
    "is_new_city",
    "risk_signal_count",
]


if __name__ == "__main__":
    # Quick test
    df = pd.read_csv("transactions.csv")
    feature_df = engineer_features(df)
    print(feature_df[FEATURE_COLUMNS].describe().round(2))
    feature_df.to_csv("features.csv", index=False)
    print("💾 Saved to features.csv")
