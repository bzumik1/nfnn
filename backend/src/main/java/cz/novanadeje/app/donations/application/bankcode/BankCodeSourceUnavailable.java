package cz.novanadeje.app.donations.application.bankcode;

public class BankCodeSourceUnavailable extends RuntimeException {

    public BankCodeSourceUnavailable(String reason) {
        super(reason);
    }
}
