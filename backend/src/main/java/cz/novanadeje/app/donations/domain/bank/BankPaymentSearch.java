package cz.novanadeje.app.donations.domain.bank;

public final class BankPaymentSearch {

    public static final int MAX_TEXT_LENGTH = 100;
    public static final int MAX_LIMIT = 500;

    private BankPaymentSearch() {
    }

    public static void checkText(String text) {
        if (text.length() > MAX_TEXT_LENGTH) {
            throw new IllegalArgumentException("A payment filter text is at most " + MAX_TEXT_LENGTH + " characters");
        }
    }

    public static void checkLimit(int limit) {
        if (limit < 1 || limit > MAX_LIMIT) {
            throw new IllegalArgumentException("A payment filter limit is between 1 and " + MAX_LIMIT);
        }
    }
}
