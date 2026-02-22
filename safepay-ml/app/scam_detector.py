"""
SafePay Family - Scam Detection Model
Detects phishing emails, scam SMS, and suspicious contacts
using TF-IDF + Logistic Regression.

Place this file at: safepay-ml/app/scam_detector.py
Run standalone to train: python scam_detector.py
The model saves to: safepay-ml/models/scam_detector.pkl
"""

import os
import re
import joblib
from sklearn.linear_model import LogisticRegression
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.pipeline import Pipeline
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, roc_auc_score

# ─── Training Data ────────────────────────────────────────────────────────────

SCAM_SAMPLES = [
    "Congratulations! You have been selected to receive a $1000 gift card. Click here now to claim your prize before it expires.",
    "Your bank account has been suspended. Verify your identity immediately by clicking this link or your account will be closed.",
    "URGENT: IRS final notice. You owe back taxes. Call immediately to avoid arrest warrant being issued against you.",
    "Dear customer, your PayPal account is limited. Please confirm your details at paypal-secure-login.com",
    "You've won the Microsoft lottery! Send your bank details to claim $500,000 prize money.",
    "Your Social Security number has been suspended due to suspicious activity. Press 1 to speak to an officer.",
    "FREE iPhone 15! You are our lucky winner. Provide credit card for shipping only $1.99",
    "Alert: Unusual sign-in to your Amazon account. Verify now at amazon-security-alert.net",
    "Your Netflix subscription has expired. Update payment at netflix-billing-update.com",
    "Grandma it's me I'm in trouble and need money wired right away please don't tell anyone",
    "Investment opportunity guaranteed 300% returns. Limited spots available. Wire transfer only.",
    "Hi this is the Social Security Administration your number has been compromised call us now",
    "You owe money to the IRS and police will be at your door in 2 hours unless you pay in gift cards",
    "Claim your inheritance from deceased relative in Nigeria. Need your bank info to transfer $4.5M",
    "Click here to verify your Chase bank account information immediately to avoid suspension",
    "Your computer has a virus! Call Microsoft support immediately at 1-800-555-0199",
    "Congratulations you have been pre-approved for a $50000 loan no credit check needed wire fee first",
    "FINAL NOTICE your Medicare benefits will be cancelled unless you confirm your details now",
    "This is Amazon security alert your account shows suspicious purchase click to cancel",
    "You have a pending package delivery. Pay $2.99 customs fee at this link to release your parcel",
    "I am a US soldier stationed overseas I need money urgently please help me my love",
    "Crypto investment guaranteed profits our AI bot made 400% last month join now limited time",
    "Your Apple ID has been locked verify at apple-id-secure.com immediately",
    "Win a free vacation just fill in your credit card details for the small booking fee",
    "Your utilities will be disconnected today unless you pay with Google Play gift cards",
    "Verify your Venmo account now to avoid permanent suspension venmo-verify.net",
    "You qualify for student loan forgiveness send your FSA ID and password to claim",
    "USPS: Your package is on hold. Confirm delivery address: usps-delivery-confirm.com",
    "FedEx alert your shipment requires customs payment visit fedex-customs-fee.net",
    "Bank of America: We've detected suspicious activity. Verify now: boa-secure-login.net",
    "Your account will be charged $299 for McAfee renewal. Call to cancel 1-800-555-0198",
    "You have been selected for a government grant of $9000 no repayment needed reply INFO",
    "Hi mom I lost my phone this is my new number I need you to send me money urgently",
    "noreply@paypa1-secure.com",
    "support@amazon-security-alert.net",
    "irs-notice@gov-tax-refund.com",
    "admin@microsoft-helpdesk-support.xyz",
    "billing@netflix-account-update.net",
    "alert@chase-bank-verify.com",
    "customer.service@amazonsupport-login.com",
]

LEGIT_SAMPLES = [
    "Your order has been shipped and will arrive by Thursday. Track your package with the link below.",
    "Thank you for your purchase. Your receipt is attached for your records.",
    "Your monthly statement is now available. Log in to your account to view it.",
    "Reminder: Your doctor appointment is scheduled for next Tuesday at 2:00 PM.",
    "Your password was successfully changed. If you did not make this change, contact support.",
    "Here is the meeting agenda for our call tomorrow. Please review before we connect.",
    "Happy birthday! Wishing you a wonderful day from all of us at the community center.",
    "Your prescription is ready for pickup at the pharmacy.",
    "Thank you for renewing your subscription. Your next billing date is March 1.",
    "The library book you requested is now available for pickup.",
    "Your flight confirmation number is ABC123. Check in online 24 hours before departure.",
    "We received your return request. A refund will be processed within 5-7 business days.",
    "Dinner is at 6pm at the usual place, let me know if you need a ride.",
    "Can you please bring the potato salad to the potluck on Saturday?",
    "Your tax documents are ready for download in your secure portal.",
    "Please review the attached contract and sign by end of week.",
    "Your verification code is 847291. Do not share this with anyone.",
    "Chase: A payment of $45.00 was made to your credit card ending in 4521.",
    "Walgreens: Your prescription is ready. Reply STOP to opt out.",
    "Reminder: Your appointment is tomorrow at 10am. Reply C to confirm.",
    "Your Uber is arriving in 3 minutes. Driver: John, Toyota Camry ABC-1234.",
    "Amazon: Your order has been delivered. Leave feedback in the app.",
    "Hi grandma just wanted to say hi and see how you are doing love you",
    "Can we reschedule our lunch to Thursday instead? Works better for me.",
    "Mom the kids soccer game starts at 4pm Saturday see you there",
    "notifications@amazon.com",
    "support@apple.com",
    "noreply@paypal.com",
    "service@chase.com",
    "info@medicare.gov",
    "alerts@bankofamerica.com",
    "no-reply@netflix.com",
    "receipts@uber.com",
    "noreply@google.com",
    "Your gym membership renews automatically on the 15th of each month.",
    "Quarterly newsletter from your financial advisor is now available.",
    "Your Zoom link for tomorrow's meeting: zoom.us/j/123456789",
    "We shipped your order! Expected delivery is Friday between 2-6pm.",
    "Your direct deposit of $1,250.00 has been received.",
    "Book club meets this Thursday at 7pm, same location as always.",
]

# ─── Signal Descriptions (used by api.py) ────────────────────────────────────

SIGNAL_DESCRIPTIONS = {
    "has_urgency":           "Urgency language detected (e.g. 'act now', 'expires today')",
    "has_prize":             "Prize or reward language detected (e.g. 'you won', 'free gift')",
    "has_threat":            "Threatening language detected (e.g. 'arrest', 'suspended', 'locked')",
    "has_money":             "Suspicious payment method mentioned (e.g. gift cards, wire transfer, crypto)",
    "has_suspicious_tld":    "Suspicious domain or URL pattern detected",
    "has_typosquat":         "Known brand name misspelled (typosquatting attempt)",
    "has_gov_impersonation": "Government agency impersonation detected (IRS, SSA, Medicare)",
    "asks_for_credentials":  "Requests sensitive information (password, SSN, bank details)",
}


# ─── Feature Extraction ───────────────────────────────────────────────────────

def extract_text_features(
    email_address: str = None,
    email_body: str = None,
    sms_content: str = None,
    phone_number: str = None,
):
    """
    Combine all inputs into one text blob + return hand-crafted signal flags.
    Returns: (combined_text: str, signals: dict)
    """
    parts = []
    if email_address:
        parts.append(f"emailaddress {email_address} {email_address}")
    if email_body:
        parts.append(email_body)
    if sms_content:
        parts.append(sms_content)
    if phone_number:
        parts.append(f"phone {phone_number}")

    combined = " ".join(parts).strip()
    text_low = combined.lower()

    signals = {
        "has_urgency": int(any(w in text_low for w in [
            "urgent", "immediately", "now", "today", "expires",
            "final notice", "last chance", "act now",
        ])),
        "has_prize": int(any(w in text_low for w in [
            "won", "winner", "congratulations", "prize", "free", "claim", "selected",
        ])),
        "has_threat": int(any(w in text_low for w in [
            "arrest", "suspended", "locked", "police", "warrant",
            "cancelled", "disconnected", "legal action",
        ])),
        "has_money": int(any(w in text_low for w in [
            "wire", "gift card", "bitcoin", "crypto", "transfer",
            "grant", "inheritance", "western union",
        ])),
        "has_suspicious_tld": int(any(w in text_low for w in [
            ".xyz", ".info", "-secure", "-verify", "-login",
            "-alert", "-update", "-confirm", "-billing",
        ])),
        "has_typosquat": int(bool(re.search(
            r'paypa[l1]|amaz[o0]n|micros[o0]ft|app[l1]e|g[o0]{2}gle|netfl[i1]x|ba[n]k[o0]famerica',
            text_low
        ))),
        "has_gov_impersonation": int(any(w in text_low for w in [
            "irs", "social security", "medicare", "fbi",
            "government grant", "social security administration",
        ])),
        "asks_for_credentials": int(any(w in text_low for w in [
            "password", "ssn", "social security number", "bank account",
            "credit card", "verify your", "confirm your", "fsa id",
        ])),
    }

    return combined, signals


# ─── Train & Save ─────────────────────────────────────────────────────────────

def train_model():
    MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "models")
    os.makedirs(MODEL_DIR, exist_ok=True)

    texts  = SCAM_SAMPLES + LEGIT_SAMPLES
    labels = [1] * len(SCAM_SAMPLES) + [0] * len(LEGIT_SAMPLES)

    X_train, X_test, y_train, y_test = train_test_split(
        texts, labels, test_size=0.2, stratify=labels, random_state=42
    )

    pipeline = Pipeline([
        ("tfidf", TfidfVectorizer(
            ngram_range=(1, 2), max_features=5000,
            sublinear_tf=True, min_df=1,
        )),
        ("lr", LogisticRegression(
            class_weight="balanced", max_iter=1000,
            C=1.0, random_state=42,
        )),
    ])

    pipeline.fit(X_train, y_train)

    y_pred  = pipeline.predict(X_test)
    y_proba = pipeline.predict_proba(X_test)[:, 1]
    auc     = roc_auc_score(y_test, y_proba)

    print(f"✅ Scam detector AUC-ROC: {auc:.3f}")
    print(classification_report(y_test, y_pred, target_names=["Legitimate", "Scam"]))

    out = os.path.join(MODEL_DIR, "scam_detector.pkl")
    joblib.dump(pipeline, out)
    print(f"💾 Saved → {out}")
    return pipeline


if __name__ == "__main__":
    train_model()