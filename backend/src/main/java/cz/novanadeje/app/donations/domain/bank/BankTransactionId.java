package cz.novanadeje.app.donations.domain.bank;

public record BankTransactionId(long value) {

    public BankTransactionId {
        if (value < 0) {
            throw new IllegalArgumentException("A bank transaction id is never negative: " + value);
        }
    }

    @Override
    public String toString() {
        return Long.toString(value);
    }
}
