package cz.novanadeje.app.donors.application;

import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;
import cz.novanadeje.app.IntegrationTest;
import cz.novanadeje.app.donors.domain.TotpSecret;
import cz.novanadeje.app.shared.application.qr.QrCodeEncoder;
import cz.novanadeje.app.shared.application.qr.QrErrorCorrection;
import cz.novanadeje.app.shared.infrastructure.qr.QrSymbols;
import cz.novanadeje.app.sharedcases.SharedCase;
import cz.novanadeje.app.sharedcases.SharedCaseRunner;
import org.springframework.beans.factory.annotation.Autowired;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

@IntegrationTest
class TotpQrSharedCasesTest extends SharedCaseRunner {

    @Autowired
    private QrCodeEncoder encoder;

    @Override
    protected String caseFile() {
        return "qr/totp.json";
    }

    @Override
    protected String when() {
        return "when the backend builds the otpauth URI for the secret, issuer and account and encodes it";
    }

    @Override
    protected String then() {
        return "then it gives the expected URI and QR symbol";
    }

    @Override
    protected void run(SharedCase sharedCase) throws Exception {
        JsonNode input = sharedCase.input();
        String uri = new TotpSecret(input.get("secret").asString()).otpauthUri(input.get("issuer").asString(), input.get("accountName").asString());
        ObjectNode actual = JsonNodeFactory.instance.objectNode();
        actual.put("uri", uri);
        actual.setAll(QrSymbols.describe(uri, encoder.encode(uri, QrErrorCorrection.MEDIUM), ErrorCorrectionLevel.M));

        assertGives(actual, sharedCase.expected());
    }
}
