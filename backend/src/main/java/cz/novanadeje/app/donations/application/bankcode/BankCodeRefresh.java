package cz.novanadeje.app.donations.application.bankcode;

public record BankCodeRefresh(boolean changed, int count) {

    public static BankCodeRefresh fetched(int count) {
        return new BankCodeRefresh(true, count);
    }

    public static BankCodeRefresh unchanged() {
        return new BankCodeRefresh(false, 0);
    }
}
