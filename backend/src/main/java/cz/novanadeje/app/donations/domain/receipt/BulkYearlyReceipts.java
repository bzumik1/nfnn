package cz.novanadeje.app.donations.domain.receipt;

public final class BulkYearlyReceipts {

    public static final int MAX_DONORS = 50;

    private BulkYearlyReceipts() {
    }

    public static void check(int donors) {
        if (donors < 1 || donors > MAX_DONORS) {
            throw new IllegalArgumentException("A bulk run issues the yearly receipts of 1 to " + MAX_DONORS + " donors");
        }
    }
}
