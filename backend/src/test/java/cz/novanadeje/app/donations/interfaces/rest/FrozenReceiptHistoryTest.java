package cz.novanadeje.app.donations.interfaces.rest;

import cz.novanadeje.app.donations.application.receipt.ReceiptFreezer;
import cz.novanadeje.app.donations.application.signing.ReceiptProofs;
import cz.novanadeje.app.donations.application.signing.ReceiptSigner;
import cz.novanadeje.app.donations.domain.receipt.FrozenReceipt;
import cz.novanadeje.app.donations.domain.receipt.FrozenReceiptCases;
import cz.novanadeje.app.donations.domain.receipt.Receipts;
import cz.novanadeje.app.donations.infrastructure.signing.Rfc8032Keys;
import cz.novanadeje.app.donations.infrastructure.texts.RecordedReceiptTextSource;
import cz.novanadeje.app.sharedcases.SharedCase;
import cz.novanadeje.app.sharedcases.SharedCaseRunner;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class FrozenReceiptHistoryTest extends SharedCaseRunner {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final ReceiptSigner signer = Rfc8032Keys.test1Signer();
    private final ReceiptProofs proofs = new ReceiptProofs(signer, Receipts.FOUNDATION, () -> false);

    @Override
    protected String caseFile() {
        return FrozenReceiptCases.CASE_FILE;
    }

    @Override
    protected String when() {
        return "when the issuer freezes it with its recorded texts and signs it and the donor's receipt endpoints write it";
    }

    @Override
    protected String then() {
        return "then the frozen receipt has the values, the texts and the verification of schema version 1";
    }

    @Override
    protected void run(SharedCase sharedCase) {
        JsonNode input = sharedCase.input();
        ReceiptFreezer freezer = new ReceiptFreezer(RecordedReceiptTextSource.of(input.get("textsSha256").asString()), proofs, signer);
        FrozenReceipt frozen = freezer.freeze(FrozenReceiptCases.documentOf(input), FrozenReceiptCases.signatureImageOf(input));

        assertGives(JSON.valueToTree(FrozenReceiptResponse.from(frozen)), sharedCase.expected());
    }
}
