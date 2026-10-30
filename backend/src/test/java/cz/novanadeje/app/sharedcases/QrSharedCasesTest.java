package cz.novanadeje.app.sharedcases;

import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;
import cz.novanadeje.app.IntegrationTest;
import cz.novanadeje.app.donations.application.GeneratePaymentQrQuery;
import cz.novanadeje.app.donations.application.GeneratePaymentQrService;
import cz.novanadeje.app.donations.application.PaymentQr;
import cz.novanadeje.app.donations.domain.BankAccount;
import cz.novanadeje.app.donations.domain.payment.QrPaymentPurpose;
import cz.novanadeje.app.donors.domain.TotpSecret;
import cz.novanadeje.app.regression.GoldenFiles;
import cz.novanadeje.app.regression.QrSymbols;
import cz.novanadeje.app.shared.application.qr.QrCodeEncoder;
import cz.novanadeje.app.shared.application.qr.QrErrorCorrection;
import cz.novanadeje.app.shared.application.qr.QrMatrix;
import cz.novanadeje.app.shared.domain.Iban;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

@IntegrationTest
class QrSharedCasesTest {

    private static final JsonNodeFactory NODES = JsonNodeFactory.instance;
    private static final List<String> PAYMENT_PARAMETERS = List.of("amount", "variableSymbol", "purpose");

    private final JsonMapper json = JsonMapper.builder().build();

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private QrCodeEncoder encoder;

    @Autowired
    private BankAccount foundationAccount;

    @Nested
    @DisplayName("Given the payment QR cases")
    class PaymentQrCases extends SharedCaseRunner {

        @Override
        protected String caseFile() {
            return "qr/payment.json";
        }

        @Override
        protected String when() {
            return "when the backend builds the payment QR for the recipient, amount, variable symbol and purpose";
        }

        @Override
        protected String then() {
            return "then it gives the expected SPAYD text and QR symbol or the expected refusal";
        }

        @Override
        protected void run(SharedCase sharedCase) throws Exception {
            BankAccount recipient = recipientOf(sharedCase.input().get("recipient"));
            JsonNode actual = recipient.equals(foundationAccount) ? endpointAnswer(sharedCase.input()) : serviceAnswer(recipient, sharedCase.input());

            assertThat(GoldenFiles.canonical(actual)).isEqualTo(GoldenFiles.canonical(sharedCase.expected()));
        }

        private ObjectNode endpointAnswer(JsonNode input) throws Exception {
            MockHttpServletRequestBuilder call = get("/api/donations/payment-qr").header("Accept-Language", "cs");
            for (String parameter : PAYMENT_PARAMETERS) {
                if (input.has(parameter)) {
                    call = call.param(parameter, input.get(parameter).asString());
                }
            }
            MockHttpServletResponse response = mockMvc.perform(call).andReturn().getResponse();
            JsonNode body = json.readTree(response.getContentAsString(StandardCharsets.UTF_8));
            if (response.getStatus() == 200) {
                return symbolOf(body.get("spayd").asString(), new QrMatrix(body.get("qrCode").get("size").asInt(), body.get("qrCode").get("modules").asString()));
            }
            ObjectNode answer = NODES.objectNode();
            ObjectNode refused = answer.putObject("refused");
            refused.put("status", response.getStatus());
            refused.put("type", body.get("type").asString());
            ArrayNode fields = refused.putArray("fields");
            if (body.has("errors")) {
                body.get("errors").valueStream().map(error -> error.get("field").asString()).sorted().distinct().forEach(fields::add);
            }
            return answer;
        }

        private ObjectNode serviceAnswer(BankAccount recipient, JsonNode input) throws Exception {
            QrPaymentPurpose purpose = input.has("purpose") ? QrPaymentPurpose.valueOf(input.get("purpose").asString()) : QrPaymentPurpose.DONATION;
            String variableSymbol = input.has("variableSymbol") ? input.get("variableSymbol").asString() : null;
            PaymentQr qr = new GeneratePaymentQrService(recipient, encoder)
                    .generate(new GeneratePaymentQrQuery(Long.parseLong(input.get("amount").asString()), variableSymbol, purpose));
            return symbolOf(qr.spayd(), qr.modules());
        }

        private static ObjectNode symbolOf(String spayd, QrMatrix matrix) throws Exception {
            ObjectNode answer = NODES.objectNode();
            answer.put("spayd", spayd);
            answer.setAll(QrSymbols.describe(spayd, matrix, ErrorCorrectionLevel.H));
            return answer;
        }

        private static BankAccount recipientOf(JsonNode recipient) {
            return new BankAccount(recipient.get("accountNumber").asString(), new Iban(recipient.get("iban").asString()), recipient.get("name").asString());
        }
    }

    @Nested
    @DisplayName("Given the TOTP QR cases")
    class TotpQrCases extends SharedCaseRunner {

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
            ObjectNode actual = NODES.objectNode();
            actual.put("uri", uri);
            actual.setAll(QrSymbols.describe(uri, encoder.encode(uri, QrErrorCorrection.MEDIUM), ErrorCorrectionLevel.M));

            assertThat(GoldenFiles.canonical(actual)).isEqualTo(GoldenFiles.canonical(sharedCase.expected()));
        }
    }
}
