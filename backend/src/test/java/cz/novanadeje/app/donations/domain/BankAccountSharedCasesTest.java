package cz.novanadeje.app.donations.domain;

import cz.novanadeje.app.shared.domain.Iban;
import cz.novanadeje.app.sharedcases.SharedCase;
import cz.novanadeje.app.sharedcases.SharedCaseRunner;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

import java.util.Optional;

class BankAccountSharedCasesTest extends SharedCaseRunner {

    private static final String RECIPIENT = "Nadační fond Nová naděje";

    private final JsonMapper json = JsonMapper.builder().build();

    @Override
    protected String caseFile() {
        return "payment/account.json";
    }

    @Override
    protected String when() {
        return "when the backend derives the IBAN of the account number and pairs it with the served IBAN";
    }

    @Override
    protected String then() {
        return "then it gives the expected IBAN and accepts the pair exactly when they match";
    }

    @Override
    protected void run(SharedCase sharedCase) {
        String accountNumber = sharedCase.input().get("accountNumber").asString();
        String iban = sharedCase.input().get("iban").asString();
        ObjectNode actual = json.createObjectNode();
        ibanOf(accountNumber).ifPresentOrElse(derived -> actual.put("ibanOfNumber", derived), () -> actual.putNull("ibanOfNumber"));
        actual.put("matches", accepted(accountNumber, iban));

        assertGives(actual, sharedCase.expected());
    }

    private static Optional<String> ibanOf(String accountNumber) {
        try {
            return Optional.of(new CzechAccountNumber(accountNumber).toIban().value());
        } catch (IllegalArgumentException refused) {
            return Optional.empty();
        }
    }

    private static boolean accepted(String accountNumber, String iban) {
        try {
            new BankAccount(accountNumber, new Iban(iban), RECIPIENT);
            return true;
        } catch (IllegalArgumentException refused) {
            return false;
        }
    }
}
