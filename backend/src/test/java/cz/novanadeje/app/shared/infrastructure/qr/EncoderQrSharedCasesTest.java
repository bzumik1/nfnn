package cz.novanadeje.app.shared.infrastructure.qr;

import com.google.zxing.WriterException;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;
import cz.novanadeje.app.shared.application.qr.QrErrorCorrection;
import cz.novanadeje.app.shared.application.qr.QrMatrix;
import cz.novanadeje.app.sharedcases.SharedCase;
import cz.novanadeje.app.sharedcases.SharedCaseRunner;

class EncoderQrSharedCasesTest extends SharedCaseRunner {

    private final ZxingQrCodeEncoder encoder = new ZxingQrCodeEncoder();

    @Override
    protected String caseFile() {
        return "qr/encoder.json";
    }

    @Override
    protected String when() {
        return "when the backend encodes its text at its level through ZXing";
    }

    @Override
    protected String then() {
        return "then it gives the expected QR symbol";
    }

    @Override
    protected void run(SharedCase sharedCase) throws Exception {
        String text = sharedCase.input().get("text").asString();
        ErrorCorrectionLevel level = ErrorCorrectionLevel.valueOf(sharedCase.input().get("errorCorrection").asString());

        assertGives(QrSymbols.describeDecoded(text, encoded(text, level), level), sharedCase.expected());
    }

    private QrMatrix encoded(String text, ErrorCorrectionLevel level) throws WriterException {
        return switch (level) {
            case M -> encoder.encode(text, QrErrorCorrection.MEDIUM);
            case H -> encoder.encode(text, QrErrorCorrection.HIGH);
            case L, Q -> QrSymbols.encodedByZxing(text, level);
        };
    }
}
