package cz.novanadeje.app.shared.infrastructure.qr;

import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;
import cz.novanadeje.app.shared.application.qr.QrErrorCorrection;
import cz.novanadeje.app.sharedcases.SharedCase;
import cz.novanadeje.app.sharedcases.SharedCaseRunner;

class TotpQrSharedCasesTest extends SharedCaseRunner {

    private final ZxingQrCodeEncoder encoder = new ZxingQrCodeEncoder();

    @Override
    protected String caseFile() {
        return "qr/totp.json";
    }

    @Override
    protected String when() {
        return "when the backend encodes its otpauth URI into the authenticator QR";
    }

    @Override
    protected String then() {
        return "then it gives the expected QR symbol";
    }

    @Override
    protected void run(SharedCase sharedCase) throws Exception {
        String uri = sharedCase.input().get("uri").asString();

        assertGives(QrSymbols.describe(uri, encoder.encode(uri, QrErrorCorrection.MEDIUM), ErrorCorrectionLevel.M), sharedCase.expected());
    }
}
