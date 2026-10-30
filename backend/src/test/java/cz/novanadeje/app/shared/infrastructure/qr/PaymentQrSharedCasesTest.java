package cz.novanadeje.app.shared.infrastructure.qr;

import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;
import cz.novanadeje.app.shared.application.qr.QrErrorCorrection;
import cz.novanadeje.app.sharedcases.SharedCase;
import cz.novanadeje.app.sharedcases.SharedCaseRunner;

class PaymentQrSharedCasesTest extends SharedCaseRunner {

    private final ZxingQrCodeEncoder encoder = new ZxingQrCodeEncoder();

    @Override
    protected String caseFile() {
        return "qr/payment.json";
    }

    @Override
    protected String when() {
        return "when the backend encodes its SPAYD text into the payment QR";
    }

    @Override
    protected String then() {
        return "then it gives the expected QR symbol";
    }

    @Override
    protected void run(SharedCase sharedCase) throws Exception {
        String spayd = sharedCase.input().get("spayd").asString();

        assertGives(QrSymbols.describe(spayd, encoder.encode(spayd, QrErrorCorrection.HIGH), ErrorCorrectionLevel.H), sharedCase.expected());
    }
}
