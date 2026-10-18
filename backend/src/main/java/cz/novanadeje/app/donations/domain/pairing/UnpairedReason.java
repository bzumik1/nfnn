package cz.novanadeje.app.donations.domain.pairing;

public enum UnpairedReason {
    NO_IDENTIFICATION,
    UNKNOWN_VARIABLE_SYMBOL,
    UNKNOWN_SENDER_ACCOUNT,
    AMBIGUOUS_SENDER_ACCOUNT,
    EXCLUDED_SENDER_ACCOUNT
}
