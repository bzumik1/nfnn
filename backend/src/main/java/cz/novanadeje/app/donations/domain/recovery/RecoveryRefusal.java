package cz.novanadeje.app.donations.domain.recovery;

public enum RecoveryRefusal {
    WRONG_AMOUNT,
    NO_SENDER_ACCOUNT,
    EXCLUDED_SENDER_ACCOUNT,
    UNKNOWN_SENDER_ACCOUNT,
    SHARED_SENDER_ACCOUNT,
    ACCOUNT_TOO_NEW
}
