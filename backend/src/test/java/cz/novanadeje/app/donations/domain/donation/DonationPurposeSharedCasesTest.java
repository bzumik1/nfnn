package cz.novanadeje.app.donations.domain.donation;

import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.shared.domain.Money;
import cz.novanadeje.app.sharedcases.SharedCase;
import cz.novanadeje.app.sharedcases.SharedCaseRunner;
import tools.jackson.databind.JsonNode;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

import static cz.novanadeje.app.donations.BankPayments.BOOKED_ON;
import static cz.novanadeje.app.donations.BankPayments.payment;
import static org.assertj.core.api.Assertions.assertThat;

class DonationPurposeSharedCasesTest extends SharedCaseRunner {

    private static final String FIELD_SEPARATOR = "\\*";
    private static final String KEY_SEPARATOR = ":";
    private static final Optional<SenderAccount> SENDER = SenderAccount.parse("2900233333", "2010");

    @Override
    protected String caseFile() {
        return "payment/spayd.json";
    }

    @Override
    protected String when() {
        return "when the bank brings the payment the browser's SPAYD text asks for and the import reads its purpose";
    }

    @Override
    protected String then() {
        return "then it is an account verification exactly when the case verifies an account with the verification amount";
    }

    @Override
    protected void run(SharedCase sharedCase) {
        if (sharedCase.expected().has("refused")) {
            assertThat(sharedCase.expected().has("spayd")).as("a refused case sends no payment").isFalse();
            return;
        }
        Map<String, String> fields = fieldsOf(sharedCase.expected().get("spayd").asString());
        Money amount = Money.czk(sharedCase.input().get("amountMinor").asLong());
        var paid = payment(1, BOOKED_ON, amount, SENDER, fields.get("X-VS"), fields.get("MSG"));

        assertThat(DonationPurpose.of(paid)).isEqualTo(expectedPurpose(sharedCase.input(), amount));
    }

    private static DonationPurpose expectedPurpose(JsonNode input, Money amount) {
        boolean verifies = input.has("purpose") && input.get("purpose").asString().equals("ACCOUNT_VERIFICATION");
        return verifies && amount.equals(DonationPurpose.VERIFICATION_AMOUNT) ? DonationPurpose.ACCOUNT_VERIFICATION : DonationPurpose.GENERAL;
    }

    private static Map<String, String> fieldsOf(String spayd) {
        return Arrays.stream(spayd.split(FIELD_SEPARATOR))
                .filter(field -> field.contains(KEY_SEPARATOR))
                .map(field -> field.split(KEY_SEPARATOR, 2))
                .collect(Collectors.toMap(pair -> pair[0], pair -> pair[1], (first, second) -> first, LinkedHashMap::new));
    }
}
