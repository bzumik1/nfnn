package cz.novanadeje.app.shared.application.recovery;

public record SecondFactorRecoveryPaymentQr(String spayd) {

    @Override
    public String toString() {
        return "SecondFactorRecoveryPaymentQr[spayd=***]";
    }
}
