package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.IntegrationTest;
import cz.novanadeje.app.donations.application.PaymentDetailsService;
import cz.novanadeje.app.donations.domain.BankAccount;
import cz.novanadeje.app.shared.domain.Iban;
import cz.novanadeje.app.sharedcases.SharedCase;
import cz.novanadeje.app.sharedcases.SharedCaseRunner;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

@IntegrationTest
class PaymentDetailsSharedCasesTest extends SharedCaseRunner {

    private final JsonMapper json = JsonMapper.builder().build();

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private BankAccount foundationAccount;

    @Override
    protected String caseFile() {
        return "payment/details.json";
    }

    @Override
    protected String when() {
        return "when the backend serves the payment details of the recipient's account";
    }

    @Override
    protected String then() {
        return "then it gives the expected account, currency, SPAYD texts and verification amount";
    }

    @Override
    protected void run(SharedCase sharedCase) throws Exception {
        BankAccount recipient = recipientOf(sharedCase.input().get("recipient"));
        JsonNode actual = recipient.equals(foundationAccount) ? endpointAnswer() : serviceAnswer(recipient);

        assertGives(actual, sharedCase.expected());
    }

    private JsonNode endpointAnswer() throws Exception {
        MockHttpServletResponse response = mockMvc.perform(get("/api/donations/payment-details").header("Accept-Language", "cs")).andReturn().getResponse();
        assertThat(response.getStatus()).as("the status of GET /api/donations/payment-details").isEqualTo(200);
        return json.readTree(response.getContentAsString(StandardCharsets.UTF_8));
    }

    private JsonNode serviceAnswer(BankAccount recipient) {
        return json.valueToTree(PaymentDetailsResponse.from(new PaymentDetailsService(recipient).details()));
    }

    private static BankAccount recipientOf(JsonNode recipient) {
        return new BankAccount(recipient.get("accountNumber").asString(), new Iban(recipient.get("iban").asString()), recipient.get("name").asString());
    }
}
