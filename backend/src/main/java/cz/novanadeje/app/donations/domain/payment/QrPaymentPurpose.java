package cz.novanadeje.app.donations.domain.payment;

public enum QrPaymentPurpose {

    DONATION("Dar Nová naděje"),
    ACCOUNT_VERIFICATION("Ověření účtu nfnn.cz");

    private final String message;

    QrPaymentPurpose(String message) {
        this.message = message;
    }

    public String message() {
        return message;
    }
}
