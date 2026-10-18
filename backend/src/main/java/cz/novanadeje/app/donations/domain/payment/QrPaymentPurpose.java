package cz.novanadeje.app.donations.domain.payment;

public enum QrPaymentPurpose {

    DONATION("Dar Nadační fond Nová naděje"),
    ACCOUNT_VERIFICATION("Ověření účtu Nadační fond Nová naděje");

    private final String message;

    QrPaymentPurpose(String message) {
        this.message = message;
    }

    public String message() {
        return message;
    }
}
