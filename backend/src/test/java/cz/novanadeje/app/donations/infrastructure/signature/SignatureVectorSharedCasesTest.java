package cz.novanadeje.app.donations.infrastructure.signature;

import cz.novanadeje.app.donations.domain.receipt.SignatureVector;
import cz.novanadeje.app.sharedcases.SharedCase;
import cz.novanadeje.app.sharedcases.SharedCaseRunner;
import tools.jackson.databind.node.JsonNodeFactory;

import java.nio.charset.StandardCharsets;

class SignatureVectorSharedCasesTest extends SharedCaseRunner {

    private final StaxSignatureVectorParser parser = new StaxSignatureVectorParser();

    @Override
    protected String caseFile() {
        return "signature/vector.json";
    }

    @Override
    protected String when() {
        return "when the backend reads the uploaded SVG and writes its canonical JSON";
    }

    @Override
    protected String then() {
        return "then it gives the expected bytes and their SHA-256";
    }

    @Override
    protected void run(SharedCase sharedCase) {
        SignatureVector vector = parser.parse(sharedCase.input().get("svg").asString().getBytes(StandardCharsets.UTF_8));

        assertGives(JsonNodeFactory.instance.objectNode()
                .put("canonical", new String(vector.canonicalBytes(), StandardCharsets.UTF_8))
                .put("sha256", vector.digest().value()), sharedCase.expected());
    }
}
