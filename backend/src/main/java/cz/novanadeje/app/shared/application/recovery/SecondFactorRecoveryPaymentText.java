package cz.novanadeje.app.shared.application.recovery;

public record SecondFactorRecoveryPaymentText(String spayd) {

    @Override
    public String toString() {
        return "SecondFactorRecoveryPaymentText[spayd=***]";
    }
}
