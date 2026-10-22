package cz.novanadeje.app.donations.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.DonorSessions;
import cz.novanadeje.app.cucumber.ScenarioDonors;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.donor.SymbolClaim;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimRepository;
import cz.novanadeje.app.shared.domain.UuidV7;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import io.cucumber.datatable.DataTable;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import org.springframework.jdbc.core.simple.JdbcClient;
import tools.jackson.databind.JsonNode;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

public class AdminSymbolClaimsStepDefinitions {

    private static final String CLAIMS_PATH = "/api/admin/donations/symbol-claims";

    private final ApiClient api;
    private final DonorSessions sessions;
    private final ScenarioDonors scenarioDonors;
    private final SymbolClaimRepository claims;
    private final JdbcClient jdbc;
    private final Map<String, UUID> rememberedClaims = new HashMap<>();

    public AdminSymbolClaimsStepDefinitions(ApiClient api, DonorSessions sessions, ScenarioDonors scenarioDonors, SymbolClaimRepository claims,
                                            JdbcClient jdbc) {
        this.api = api;
        this.sessions = sessions;
        this.scenarioDonors = scenarioDonors;
        this.claims = claims;
        this.jdbc = jdbc;
    }

    @When("{string} asks for the symbol answers")
    public void asksForTheSymbolAnswers(String alias) {
        sessions.actAs(alias);
        api.get(CLAIMS_PATH);
    }

    @When("someone without a token asks for the symbol answers")
    public void someoneWithoutATokenAsksForTheSymbolAnswers() {
        api.forgetCredentials();
        api.get(CLAIMS_PATH);
    }

    @When("{string} reverses the symbol answer of {string} to {string}")
    public void reversesTheSymbolAnswerOf(String alias, String donorAlias, String symbol) {
        sessions.actAs(alias);
        api.post(CLAIMS_PATH + "/" + claimOf(donorAlias, symbol) + "/reverse", Map.of());
    }

    @When("{string} deletes the symbol answer of {string} to {string}")
    public void deletesTheSymbolAnswerOf(String alias, String donorAlias, String symbol) {
        sessions.actAs(alias);
        api.delete(CLAIMS_PATH + "/" + claimOf(donorAlias, symbol));
    }

    @When("{string} reverses an unknown symbol answer")
    public void reversesAnUnknownSymbolAnswer(String alias) {
        sessions.actAs(alias);
        api.post(CLAIMS_PATH + "/" + UuidV7.generate(Instant.now()) + "/reverse", Map.of());
    }

    @When("{string} deletes an unknown symbol answer")
    public void deletesAnUnknownSymbolAnswer(String alias) {
        sessions.actAs(alias);
        api.delete(CLAIMS_PATH + "/" + UuidV7.generate(Instant.now()));
    }

    @Then("the symbol answers are:")
    public void theSymbolAnswersAre(DataTable table) {
        List<Map<String, String>> expected = table.asMaps();
        List<Map<String, String>> actual = new ArrayList<>();
        api.lastResponseJson().get("items").forEach(item -> {
            Map<String, String> row = new HashMap<>();
            expected.getFirst().keySet().forEach(column -> row.put(column, textOf(item.get(column))));
            actual.add(row);
        });
        assertThat(actual).containsExactlyElementsOf(expected);
    }

    @Then("the admin action {string} by {string} on the symbol answer of {string} to {string} is recorded")
    public void theAdminActionOnTheSymbolAnswerIsRecorded(String action, String alias, String donorAlias, String symbol) {
        UUID claim = rememberedClaims.computeIfAbsent(donorAlias + "/" + symbol, key -> claimOf(donorAlias, symbol));
        List<String> details = jdbc.sql("select details from admin_action where action = ? and admin_id = ? and subject_id = ?")
                .param(action)
                .param(scenarioDonors.idOf(alias))
                .param(claim)
                .query(String.class)
                .list();
        assertThat(details).hasSize(1);
        assertThat(details.getFirst()).contains(symbol, claim.toString());
    }

    @Then("{string} has no stored answer to symbol {string} from bank account {string}")
    public void hasNoStoredAnswer(String alias, String symbol, String account) {
        String[] parts = account.split("/");
        assertThat(claims.findByDonor(new DonorReference(scenarioDonors.idOf(alias))))
                .noneMatch(claim -> claim.answers(new SenderAccount(parts[0], parts[1]), new VariableSymbol(symbol)));
    }

    private UUID claimOf(String donorAlias, String symbol) {
        UUID id = claims.findByDonor(new DonorReference(scenarioDonors.idOf(donorAlias))).stream()
                .filter(claim -> claim.symbol().value().equals(symbol))
                .map(SymbolClaim::id)
                .findFirst()
                .orElseThrow(() -> new AssertionError("\"" + donorAlias + "\" has not answered symbol " + symbol))
                .value();
        rememberedClaims.put(donorAlias + "/" + symbol, id);
        return id;
    }

    private static String textOf(JsonNode node) {
        if (node == null || node.isNull()) {
            return "";
        }
        return node.isNumber() ? node.numberValue().toString() : node.asString();
    }
}
