package cz.novanadeje.app.regression;

import com.google.zxing.EncodeHintType;
import com.google.zxing.WriterException;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.common.DecoderResult;
import com.google.zxing.qrcode.decoder.Decoder;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;
import com.google.zxing.qrcode.encoder.ByteMatrix;
import com.google.zxing.qrcode.encoder.Encoder;
import com.google.zxing.qrcode.encoder.QRCode;
import cz.novanadeje.app.TestcontainersConfiguration;
import cz.novanadeje.app.donations.application.GeneratePaymentQrQuery;
import cz.novanadeje.app.donations.application.GeneratePaymentQrService;
import cz.novanadeje.app.donations.application.PaymentQr;
import cz.novanadeje.app.donations.domain.BankAccount;
import cz.novanadeje.app.donations.domain.payment.QrPaymentPurpose;
import cz.novanadeje.app.donors.application.DonorSecondFactorProperties;
import cz.novanadeje.app.donors.domain.TotpSecret;
import cz.novanadeje.app.shared.QrCodes;
import cz.novanadeje.app.shared.application.qr.QrCodeEncoder;
import cz.novanadeje.app.shared.application.qr.QrErrorCorrection;
import cz.novanadeje.app.shared.application.qr.QrMatrix;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {"app.donations.fio.token=", "app.donations.report.cron=-", "app.contact.retention.cron=-", "app.content.media-cleanup.cron=-", "app.operations.backups.check-cron=-", "app.donors.registration-reminder.cron=-"})
@AutoConfigureMockMvc
class QrGoldenCasesTest {

    static final String PAYMENT_CASES = "shared-cases/qr/payment.json";
    static final String TOTP_CASES = "shared-cases/qr/totp.json";
    private static final String SOURCE = "v2-baseline@70e9233";
    private static final JsonNodeFactory NODES = JsonNodeFactory.instance;
    private static final int ECI_MODE = 0b0111;
    private static final Map<EncodeHintType, Object> PRODUCTION_HINTS = Map.of(EncodeHintType.CHARACTER_SET, StandardCharsets.ISO_8859_1.name());

    private static final List<PaymentRequest> PAYMENT_REQUESTS = List.of(
            PaymentRequest.valid("1 Kč without a variable symbol", "1", null, null),
            PaymentRequest.valid("100 Kč without a variable symbol", "100", null, null),
            PaymentRequest.valid("500 Kč without a variable symbol", "500", null, null),
            PaymentRequest.valid("1 000 Kč without a variable symbol", "1000", null, null),
            PaymentRequest.valid("1 234 Kč without a variable symbol", "1234", null, null),
            PaymentRequest.valid("1 000 000 Kč, the largest amount, without a variable symbol", "1000000", null, null),
            PaymentRequest.valid("500 Kč with a one-digit variable symbol", "500", "7", null),
            PaymentRequest.valid("500 Kč with a ten-digit variable symbol", "500", "1234567890", null),
            PaymentRequest.valid("500 Kč with a variable symbol starting with zeros", "500", "0012345678", null),
            PaymentRequest.valid("1 000 Kč as a donation named explicitly", "1000", "1234567890", "DONATION"),
            PaymentRequest.valid("1 Kč verifying a donor's account", "1", "1234567890", "ACCOUNT_VERIFICATION"),
            PaymentRequest.valid("1 234 Kč verifying a donor's account", "1234", "4815162342", "ACCOUNT_VERIFICATION"),
            PaymentRequest.refused("amount 0 is refused", "0", null, null),
            PaymentRequest.refused("amount 1 000 001 is refused", "1000001", null, null),
            PaymentRequest.refused("a negative amount is refused", "-5", null, null),
            PaymentRequest.refused("an amount that is not a number is refused", "abc", null, null),
            PaymentRequest.refused("an amount with hellers is refused", "12.50", null, null),
            PaymentRequest.refused("a missing amount is refused", null, null, null),
            PaymentRequest.refused("an eleven-digit variable symbol is refused", "500", "12345678901", null),
            PaymentRequest.refused("a variable symbol with a letter is refused", "500", "12a", null),
            PaymentRequest.refused("an account verification without a variable symbol is refused", "1", null, "ACCOUNT_VERIFICATION"),
            PaymentRequest.refused("an unknown purpose is refused", "1", null, "GIFT"));

    private static final List<RecipientCase> RECIPIENT_CASES = List.of(
            new RecipientCase("a recipient name of exactly 35 characters is kept whole", "Spolek přátel školy Tišnov 1234 ABC"),
            new RecipientCase("a recipient name over 35 characters is cut at 35", "Nadační fond Nová naděje pro děti a mládež z Tišnova"),
            new RecipientCase("lowercase, diacritics and symbols in a recipient name become SPAYD text", "Žluťoučký kůň 100% + *hvězda* & spol."));

    private static final List<TotpCase> TOTP_REQUESTS = List.of(
            new TotpCase("a short address", "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP", "jana@example.cz"),
            new TotpCase("an address with a dot", "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", "jana.novakova@example.cz"),
            new TotpCase("an address with a plus sign", "MFRGGZDFMZTWQ2LKNNWG23TPOBYXE43U", "jana+sprava@example.cz"),
            new TotpCase("a long address", "KRUGKIDROVUWG2ZAMJZG653OEBTG66BA", "administrace.nadacniho.fondu.nova.nadeje@example.cz"),
            new TotpCase("an address of a company domain", "ONSWG4TFOQQGC3TEEBZWK4TWMVZCAMZS", "ucetni@stavby.cz"));

    private final JsonMapper json = JsonMapper.builder().build();

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private QrCodeEncoder encoder;

    @Autowired
    private BankAccount foundationAccount;

    @Autowired
    private DonorSecondFactorProperties secondFactor;

    @Test
    @DisplayName("Given the payment QR cases, when v2 answers them, then the answers equal the recorded shared cases")
    void should_equal_the_recorded_shared_cases_when_v2_answers_the_payment_qr_cases() throws Exception {
        GoldenFiles.assertMatches(PAYMENT_CASES, paymentCases());
    }

    @Test
    @DisplayName("Given the TOTP QR cases, when v2 encodes them, then the matrices equal the recorded shared cases")
    void should_equal_the_recorded_shared_cases_when_v2_encodes_the_totp_qr_cases() throws Exception {
        GoldenFiles.assertMatches(TOTP_CASES, totpCases());
    }

    @Test
    @DisplayName("Given the QR cases, when they are generated twice, then both runs give identical files")
    void should_give_identical_files_when_the_qr_cases_are_generated_twice() throws Exception {
        assertThat(GoldenFiles.canonical(paymentCases())).isEqualTo(GoldenFiles.canonical(paymentCases()));
        assertThat(GoldenFiles.canonical(totpCases())).isEqualTo(GoldenFiles.canonical(totpCases()));
    }

    @Test
    @DisplayName("Given a TOTP URI, when v2 encodes it, then it is in byte mode with the ECI 1 header that ISO-8859-1 adds")
    void should_carry_the_eci_1_header_in_byte_mode_when_v2_encodes_a_totp_uri() throws Exception {
        JsonNode first = totpCases().get("cases").get(0).get("expected");

        assertThat(first.get("mode").asString()).isEqualTo("BYTE");
        assertThat(first.get("eci").asInt()).isEqualTo(1);
    }

    @Test
    @DisplayName("Given a SPAYD text, when v2 encodes it, then it is in alphanumeric mode without an ECI header")
    void should_use_alphanumeric_mode_without_eci_when_v2_encodes_a_spayd_text() throws Exception {
        JsonNode first = paymentCases().get("cases").get(0).get("expected");

        assertThat(first.get("mode").asString()).isEqualTo("ALPHANUMERIC");
        assertThat(first.get("eci").isNull()).isTrue();
    }

    private ObjectNode paymentCases() throws Exception {
        ArrayNode cases = NODES.arrayNode();
        for (PaymentRequest request : PAYMENT_REQUESTS) {
            cases.add(paymentCase(request));
        }
        for (RecipientCase recipient : RECIPIENT_CASES) {
            cases.add(recipientCase(recipient));
        }
        return header("The SPAYD text and its QR matrix (ZXing 3.5.4, level H, ISO-8859-1 hint) that GET /api/donations/payment-qr answers, "
                + "and the refusals of its invalid parameters; the recipient cases come from GeneratePaymentQrService with another account", cases);
    }

    private ObjectNode paymentCase(PaymentRequest request) throws Exception {
        MockHttpServletRequestBuilder call = get("/api/donations/payment-qr").header("Accept-Language", "cs");
        ObjectNode input = NODES.objectNode();
        input.set("recipient", recipient(foundationAccount));
        for (Map.Entry<String, String> parameter : request.parameters().entrySet()) {
            input.put(parameter.getKey(), parameter.getValue());
            call = call.param(parameter.getKey(), parameter.getValue());
        }
        MockHttpServletResponse response = mockMvc.perform(call).andReturn().getResponse();
        JsonNode body = json.readTree(response.getContentAsString(StandardCharsets.UTF_8));
        ObjectNode expected = NODES.objectNode();
        if (request.valid()) {
            assertThat(response.getStatus()).as(request.name()).isEqualTo(200);
            String spayd = body.get("spayd").asString();
            expected.put("spayd", spayd);
            expected.setAll(symbol(spayd, new QrMatrix(body.get("qrCode").get("size").asInt(), body.get("qrCode").get("modules").asString()), ErrorCorrectionLevel.H));
        } else {
            assertThat(response.getStatus()).as(request.name()).isEqualTo(400);
            ObjectNode refused = expected.putObject("refused");
            refused.put("status", response.getStatus());
            refused.put("type", body.get("type").asString());
            ArrayNode fields = refused.putArray("fields");
            if (body.has("errors")) {
                body.get("errors").valueStream().map(error -> error.get("field").asString()).sorted().distinct().forEach(fields::add);
            }
        }
        return entry(request.name(), input, expected);
    }

    private ObjectNode recipientCase(RecipientCase recipientCase) throws Exception {
        BankAccount account = new BankAccount(foundationAccount.accountNumber(), foundationAccount.iban(), recipientCase.recipientName());
        PaymentQr qr = new GeneratePaymentQrService(account, encoder).generate(new GeneratePaymentQrQuery(500, "1234567890", QrPaymentPurpose.DONATION));
        ObjectNode input = NODES.objectNode();
        input.set("recipient", recipient(account));
        input.put("amount", "500");
        input.put("variableSymbol", "1234567890");
        ObjectNode expected = NODES.objectNode();
        expected.put("spayd", qr.spayd());
        expected.setAll(symbol(qr.spayd(), qr.modules(), ErrorCorrectionLevel.H));
        return entry(recipientCase.name(), input, expected);
    }

    private ObjectNode totpCases() throws Exception {
        ArrayNode cases = NODES.arrayNode();
        for (TotpCase totp : TOTP_REQUESTS) {
            String uri = new TotpSecret(totp.secret()).otpauthUri(secondFactor.issuer(), totp.accountName());
            ObjectNode input = NODES.objectNode();
            input.put("secret", totp.secret());
            input.put("issuer", secondFactor.issuer());
            input.put("accountName", totp.accountName());
            ObjectNode expected = NODES.objectNode();
            expected.put("uri", uri);
            expected.setAll(symbol(uri, encoder.encode(uri, QrErrorCorrection.MEDIUM), ErrorCorrectionLevel.M));
            cases.add(entry(totp.name(), input, expected));
        }
        return header("The otpauth:// URI that DonorSecondFactorService builds for a fixed test secret and its QR matrix "
                + "(ZXing 3.5.4, level M, ISO-8859-1 hint); the secrets are test values, never used anywhere else", cases);
    }

    private ObjectNode symbol(String payload, QrMatrix production, ErrorCorrectionLevel level) throws WriterException {
        QRCode reference = Encoder.encode(payload, level, PRODUCTION_HINTS);
        assertThat(modulesOf(reference.getMatrix())).as("ZXing's encoder reproduces the production matrix of %s", payload).isEqualTo(production.modules());
        assertThat(QrCodes.decode(production)).as("the production matrix scans back").isEqualTo(payload);
        byte[] dataCodewords = decoded(production).getRawBytes();
        int firstMode = (dataCodewords[0] >> 4) & 0x0F;
        boolean eci = firstMode == ECI_MODE;
        int payloadMode = eci ? dataCodewords[1] & 0x0F : firstMode;
        ObjectNode symbol = NODES.objectNode();
        symbol.put("errorCorrection", level.name());
        symbol.put("version", reference.getVersion().getVersionNumber());
        symbol.put("mode", modeName(payloadMode));
        if (eci) {
            symbol.put("eci", ((dataCodewords[0] & 0x0F) << 4) | ((dataCodewords[1] >> 4) & 0x0F));
        } else {
            symbol.putNull("eci");
        }
        symbol.put("mask", reference.getMaskPattern());
        symbol.put("size", production.size());
        ArrayNode rows = symbol.putArray("matrix");
        for (int row = 0; row < production.size(); row++) {
            rows.add(production.modules().substring(row * production.size(), (row + 1) * production.size()));
        }
        return symbol;
    }

    private static String modeName(int bits) {
        return switch (bits) {
            case 0b0001 -> "NUMERIC";
            case 0b0010 -> "ALPHANUMERIC";
            case 0b0100 -> "BYTE";
            case 0b1000 -> "KANJI";
            default -> throw new IllegalStateException("Unexpected QR mode indicator " + bits);
        };
    }

    private static DecoderResult decoded(QrMatrix matrix) {
        BitMatrix bits = new BitMatrix(matrix.size());
        for (int row = 0; row < matrix.size(); row++) {
            for (int column = 0; column < matrix.size(); column++) {
                if (matrix.isDark(column, row)) {
                    bits.set(column, row);
                }
            }
        }
        try {
            return new Decoder().decode(bits);
        } catch (Exception unreadable) {
            throw new AssertionError("The matrix does not decode", unreadable);
        }
    }

    private static String modulesOf(ByteMatrix matrix) {
        StringBuilder modules = new StringBuilder();
        for (int row = 0; row < matrix.getHeight(); row++) {
            for (int column = 0; column < matrix.getWidth(); column++) {
                modules.append(matrix.get(column, row) == 1 ? '1' : '0');
            }
        }
        return modules.toString();
    }

    private static ObjectNode recipient(BankAccount account) {
        ObjectNode recipient = NODES.objectNode();
        recipient.put("accountNumber", account.accountNumber());
        recipient.put("iban", account.iban().value());
        recipient.put("name", account.recipientName());
        return recipient;
    }

    private static ObjectNode header(String logic, ArrayNode cases) {
        ObjectNode file = NODES.objectNode();
        file.put("source", SOURCE);
        file.put("logic", logic);
        file.set("cases", cases);
        return file;
    }

    private static ObjectNode entry(String name, ObjectNode input, ObjectNode expected) {
        ObjectNode entry = NODES.objectNode();
        entry.put("name", name);
        entry.set("input", input);
        entry.set("expected", expected);
        return entry;
    }

    private record PaymentRequest(String name, Map<String, String> parameters, boolean valid) {

        static PaymentRequest valid(String name, String amount, String variableSymbol, String purpose) {
            return new PaymentRequest(name, parameters(amount, variableSymbol, purpose), true);
        }

        static PaymentRequest refused(String name, String amount, String variableSymbol, String purpose) {
            return new PaymentRequest(name, parameters(amount, variableSymbol, purpose), false);
        }

        private static Map<String, String> parameters(String amount, String variableSymbol, String purpose) {
            Map<String, String> parameters = new LinkedHashMap<>();
            if (amount != null) {
                parameters.put("amount", amount);
            }
            if (variableSymbol != null) {
                parameters.put("variableSymbol", variableSymbol);
            }
            if (purpose != null) {
                parameters.put("purpose", purpose);
            }
            return parameters;
        }
    }

    private record RecipientCase(String name, String recipientName) {
    }

    private record TotpCase(String name, String secret, String accountName) {
    }
}
