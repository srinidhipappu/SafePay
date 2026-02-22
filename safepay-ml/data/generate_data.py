"""
SafePay Family - Synthetic Fiserv-Style Transaction Data Generator
Generates realistic senior spending patterns + injected fraud cases
"""

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import random
import json

np.random.seed(42)
random.seed(42)

# --- Senior Profiles ---
SENIORS = [
    {"user_id": "sr_001", "name": "Margaret", "home_city": "Tampa", "avg_spend": 45, "std_spend": 20},
    {"user_id": "sr_002", "name": "Robert",   "home_city": "Phoenix", "avg_spend": 80, "std_spend": 35},
    {"user_id": "sr_003", "name": "Dorothy",  "home_city": "Denver", "avg_spend": 30, "std_spend": 15},
]

# Merchant Codes (MCC) seniors commonly use
NORMAL_MCCS = {
    "5411": "Grocery Stores",
    "5912": "Drug Stores/Pharmacies",
    "5812": "Eating Places",
    "4111": "Local Transit",
    "7011": "Hotels",
    "5311": "Department Stores",
    "5541": "Gas Stations",
    "8011": "Doctor Offices",
}

# High-risk MCCs for fraud injection
RISKY_MCCS = {
    "6051": "Gift Cards / Crypto",
    "7995": "Gambling",
    "6012": "Financial Institutions (unusual)",
    "4814": "Telecom (scam common)",
}

MERCHANTS_BY_MCC = {
    "5411": ["Publix", "Kroger", "Safeway", "Whole Foods"],
    "5912": ["CVS Pharmacy", "Walgreens", "Rite Aid"],
    "5812": ["Denny's", "IHOP", "Cracker Barrel", "Applebee's"],
    "4111": ["City Transit", "Uber", "Lyft"],
    "7011": ["Hampton Inn", "Holiday Inn", "Best Western"],
    "5311": ["Kohl's", "JCPenney", "Macy's"],
    "5541": ["Shell", "BP", "Chevron", "ExxonMobil"],
    "8011": ["Family Medical", "Senior Clinic", "Urgent Care"],
    "6051": ["Walmart Gift Card", "Target eGift", "CoinFlip ATM"],
    "7995": ["BetMGM", "DraftKings", "Casino Online"],
    "6012": ["Wire Transfer Co", "MoneyGram", "Western Union"],
    "4814": ["TechSupport Inc", "Microsoft Alert", "IRS Payment Line"],
}

CITIES_BY_SENIOR = {
    "sr_001": ["Tampa", "Tampa", "Tampa", "Orlando", "Tampa"],  # mostly home
    "sr_002": ["Phoenix", "Phoenix", "Scottsdale", "Phoenix", "Phoenix"],
    "sr_003": ["Denver", "Denver", "Denver", "Boulder", "Denver"],
}

FRAUD_CITIES = ["Lagos", "Minsk", "Unknown City", "Chicago", "New York"]


def generate_transaction(user, date, is_fraud=False, fraud_type=None):
    """Generate a single transaction for a senior user."""

    if is_fraud:
        mcc = random.choice(list(RISKY_MCCS.keys()))
        merchant = random.choice(MERCHANTS_BY_MCC[mcc])
        city = random.choice(FRAUD_CITIES)

        if fraud_type == "large_amount":
            amount = round(np.random.uniform(300, 2000), 2)
        elif fraud_type == "gift_card":
            amount = round(random.choice([100, 200, 500, 1000]), 2)
            mcc = "6051"
            merchant = random.choice(MERCHANTS_BY_MCC["6051"])
        elif fraud_type == "unusual_hour":
            amount = round(np.random.uniform(50, 400), 2)
            date = date.replace(hour=random.randint(1, 4))  # 1-4 AM
        else:
            amount = round(np.random.uniform(200, 1500), 2)

        label = 1  # fraudulent
    else:
        mcc = random.choice(list(NORMAL_MCCS.keys()))
        merchant = random.choice(MERCHANTS_BY_MCC[mcc])
        city = random.choice(CITIES_BY_SENIOR[user["user_id"]])
        amount = max(1.0, round(np.random.normal(user["avg_spend"], user["std_spend"]), 2))
        label = 0  # normal

    hour = date.hour if is_fraud and fraud_type == "unusual_hour" else random.choices(
        range(24),
        weights=[1,1,1,1,1,2,3,5,7,8,8,7,7,8,8,7,6,5,5,5,4,3,2,1],
        k=1
    )[0]

    return {
        "transaction_id": f"txn_{random.randint(100000, 999999)}",
        "user_id": user["user_id"],
        "amount": amount,
        "merchant": merchant,
        "mcc": mcc,
        "mcc_description": RISKY_MCCS.get(mcc, NORMAL_MCCS.get(mcc, "Other")),
        "timestamp": date.replace(hour=hour, minute=random.randint(0, 59)).isoformat(),
        "city": city,
        "device_id": f"dev_{user['user_id']}_{random.randint(1,3)}",
        "authorized": True,
        "is_fraud": label,
    }


def generate_dataset(n_normal=2000, n_fraud=150):
    """Generate full dataset with normal + fraud transactions across all seniors."""
    transactions = []
    start_date = datetime.now() - timedelta(days=90)

    # --- Normal transactions ---
    for _ in range(n_normal):
        user = random.choice(SENIORS)
        days_offset = random.randint(0, 89)
        date = start_date + timedelta(days=days_offset)
        transactions.append(generate_transaction(user, date, is_fraud=False))

    # --- Fraud transactions (injected) ---
    fraud_types = ["large_amount", "gift_card", "unusual_hour", "new_location"]
    for _ in range(n_fraud):
        user = random.choice(SENIORS)
        days_offset = random.randint(0, 89)
        date = start_date + timedelta(days=days_offset)
        fraud_type = random.choice(fraud_types)
        transactions.append(generate_transaction(user, date, is_fraud=True, fraud_type=fraud_type))

    df = pd.DataFrame(transactions)
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df = df.sort_values("timestamp").reset_index(drop=True)

    print(f"✅ Generated {len(df)} transactions")
    print(f"   Normal: {(df['is_fraud']==0).sum()} | Fraud: {(df['is_fraud']==1).sum()}")
    print(f"   Users: {df['user_id'].nunique()}")
    return df


if __name__ == "__main__":
    df = generate_dataset()
    df.to_csv("transactions.csv", index=False)
    print("💾 Saved to transactions.csv")
    print(df.head(3).to_string())
