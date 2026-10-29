package cz.novanadeje.app.shared.application.recovery;

import cz.novanadeje.app.shared.application.qr.QrMatrix;

public record SecondFactorRecoveryPaymentQr(String spayd, QrMatrix qrCode) {

    @Override
    public String toString() {
        return "SecondFactorRecoveryPaymentQr[spayd=***, qrCode=***]";
    }
}
