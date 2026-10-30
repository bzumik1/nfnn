package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.IntegrationTest;
import cz.novanadeje.app.donations.application.GeneratePaymentQrQuery;
import cz.novanadeje.app.donations.application.GeneratePaymentQrService;
import cz.novanadeje.app.donations.domain.BankAccount;
import cz.novanadeje.app.donations.domain.payment.QrPaymentPurpose;
import cz.novanadeje.app.shared.application.qr.QrCodeEncoder;
import cz.novanadeje.app.shared.domain.Iban;
import cz.novanadeje.app.sharedcases.SharedCase;
import cz.novanadeje.app.sharedcases.SharedCaseRunner;
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

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

@IntegrationTest
class SpaydSharedCasesTest extends SharedCaseRunner {

    private static final JsonNodeFactory NODES = JsonNodeFactory.instance;
    private static final List<String> PAYMENT_PARAMETERS = List.of("amount", "variableSymbol", "purpose");

    private final JsonMapper json = JsonMapper.builder().build();

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private QrCodeEncoder encoder;

    @Autowired
    private BankAccount foundationAccount;

    @Override
    protected String caseFile() {
        return "payment/spayd.json";
    }

    @Override
    protected String when() {
        return "when the backend builds the payment's SPAYD text for the recipient, amount, variable symbol and purpose";
    }

    @Override
    protected String then() {
        return "then it gives the expected SPAYD text or the expected refusal";
    }

    @Override
    protected void run(SharedCase sharedCase) throws Exception {
        BankAccount recipient = recipientOf(sharedCase.input().get("recipient"));
        JsonNode actual = recipient.equals(foundationAccount) ? endpointAnswer(sharedCase.input()) : serviceAnswer(recipient, sharedCase.input());

        assertGives(actual, sharedCase.expected());
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
            return NODES.objectNode().put("spayd", body.get("spayd").asString());
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

    private ObjectNode serviceAnswer(BankAccount recipient, JsonNode input) {
        QrPaymentPurpose purpose = input.has("purpose") ? QrPaymentPurpose.valueOf(input.get("purpose").asString()) : QrPaymentPurpose.DONATION;
        String variableSymbol = input.has("variableSymbol") ? input.get("variableSymbol").asString() : null;
        String spayd = new GeneratePaymentQrService(recipient, encoder)
                .generate(new GeneratePaymentQrQuery(Long.parseLong(input.get("amount").asString()), variableSymbol, purpose))
                .spayd();
        return NODES.objectNode().put("spayd", spayd);
    }

    private static BankAccount recipientOf(JsonNode recipient) {
        return new BankAccount(recipient.get("accountNumber").asString(), new Iban(recipient.get("iban").asString()), recipient.get("name").asString());
    }
}
