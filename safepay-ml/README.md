# 🛡️ SafePay Family — ML Risk Scoring Service

AI-powered fraud detection for senior financial protection.

---

## 🚀 Quick Start (5 minutes)

### 1. Install dependencies
```bash
pip install -r requirements.txt
```

### 2. Generate training data
```bash
cd data
python generate_data.py
cd ..
```

### 3. Train the models
```bash
cd app
python train.py
```
You'll see output like:
```
✅ Generated 2150 transactions
🌲 Training Isolation Forest...
📊 Training Logistic Regression...
   ✅ LR AUC-ROC: 0.94+
🎯 Final Risk Score Evaluation
   Fraud Detection Rate: ~85%
💾 Saving models...
🎉 Training complete!
```

### 4. Start the API
```bash
uvicorn api:app --reload --port 8001
```

### 5. Test it
```bash
# Score a suspicious transaction
curl -X POST http://localhost:8001/score \
  -H "Content-Type: application/json" \
  -d '{
    "transaction_id": "txn_test_001",
    "user_id": "sr_001",
    "amount": 850.00,
    "merchant": "CoinFlip ATM",
    "mcc": "6051",
    "timestamp": "2024-01-15T02:30:00",
    "city": "Unknown City"
  }'
```

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/health` | Service health check |
| POST | `/score` | Score a transaction |
| GET  | `/model-info` | Model metadata |
| GET  | `/users/{id}/baseline` | User behavioral baseline |

## 📊 Risk Score Response

```json
{
  "transaction_id": "txn_test_001",
  "user_id": "sr_001",
  "risk_score": 0.87,
  "risk_level": "CRITICAL",
  "anomaly_score": 0.91,
  "fraud_probability": 0.79,
  "risk_flags": [
    {
      "flag": "LARGE_AMOUNT",
      "description": "Transaction is 18.9x your usual spending (avg: $45)",
      "severity": "high"
    },
    {
      "flag": "HIGH_RISK_CATEGORY",
      "description": "Gift Cards/Cryptocurrency — frequently used in scams targeting seniors",
      "severity": "high"
    },
    {
      "flag": "NEW_LOCATION",
      "description": "Transaction in 'Unknown City' — not in your usual locations",
      "severity": "high"
    },
    {
      "flag": "UNUSUAL_TIME",
      "description": "Transaction at 2:00 AM — outside your normal activity hours",
      "severity": "medium"
    }
  ],
  "gemini_prompt_context": {
    "prompt_template": "A transaction was flagged... [ready to send to Gemini]"
  },
  "recommendation": "Block and require family approval before proceeding"
}
```

---

## 🧠 How It Works

### Feature Engineering (17 features)
- **Amount signals**: ratio vs personal average, z-score, rolling 7-day spend
- **Merchant signals**: new merchant, new MCC category, high-risk MCC flag
- **Time signals**: unusual hour, velocity (txns per hour)
- **Location signals**: new city flag

### Model Pipeline
```
Transaction
    ↓
Feature Engineering (17 features)
    ↓
┌───────────────────┐    ┌──────────────────────┐
│ Isolation Forest  │    │ Logistic Regression   │
│ (Anomaly Score)   │    │ (Fraud Probability)   │
└─────────┬─────────┘    └──────────┬───────────┘
          │  × 0.6                  │  × 0.4
          └──────────┬──────────────┘
                     ↓
              Final Risk Score (0–1)
                     ↓
         LOW / MEDIUM / HIGH / CRITICAL
```

### Risk Thresholds
| Level    | Score     | Action                          |
|----------|-----------|---------------------------------|
| LOW      | < 0.30    | Approve automatically           |
| MEDIUM   | 0.30–0.50 | Notify senior                   |
| HIGH     | 0.50–0.75 | Alert family + confirm          |
| CRITICAL | > 0.75    | Block + require family approval |

---

## 🔗 Integration with Node Backend

```javascript
// In your Express route after receiving a transaction:
const mlResponse = await fetch('http://localhost:8001/score', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    transaction_id: txn.id,
    user_id: txn.userId,
    amount: txn.amount,
    merchant: txn.merchant,
    mcc: txn.mcc,
    timestamp: txn.timestamp,
    city: txn.city,
  })
});

const risk = await mlResponse.json();

if (risk.risk_level === 'HIGH' || risk.risk_level === 'CRITICAL') {
  // 1. Create alert in DB
  // 2. Call Gemini with risk.gemini_prompt_context.prompt_template
  // 3. Send WebSocket notification to family dashboard
}
```

---

## 📁 File Structure

```
safepay-ml/
├── data/
│   └── generate_data.py     # Synthetic Fiserv-style data generator
├── app/
│   ├── features.py          # Feature engineering pipeline
│   ├── train.py             # Model training + evaluation
│   └── api.py               # FastAPI scoring service
├── models/                  # Auto-created after training
│   ├── isolation_forest.pkl
│   ├── logistic_regression.pkl
│   ├── scaler.pkl
│   ├── baselines.pkl
│   └── feature_importance.json
└── requirements.txt
```
