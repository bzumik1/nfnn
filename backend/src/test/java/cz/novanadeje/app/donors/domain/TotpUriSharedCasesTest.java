package cz.novanadeje.app.donors.domain;

import cz.novanadeje.app.sharedcases.SharedCase;
import cz.novanadeje.app.sharedcases.SharedCaseRunner;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.JsonNodeFactory;

class TotpUriSharedCasesTest extends SharedCaseRunner {

    @Override
    protected String caseFile() {
        return "totp/uri.json";
    }

    @Override
    protected String when() {
        return "when the backend builds the otpauth URI for the secret, issuer and account";
    }

    @Override
    protected String then() {
        return "then it gives the expected URI";
    }

    @Override
    protected void run(SharedCase sharedCase) {
        JsonNode input = sharedCase.input();
        String uri = new TotpSecret(input.get("secret").asString()).otpauthUri(input.get("issuer").asString(), input.get("accountName").asString());

        assertGives(JsonNodeFactory.instance.objectNode().put("uri", uri), sharedCase.expected());
    }
}
