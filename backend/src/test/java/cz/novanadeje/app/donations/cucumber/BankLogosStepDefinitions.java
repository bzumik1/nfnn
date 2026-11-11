package cz.novanadeje.app.donations.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.DonorSessions;
import cz.novanadeje.app.donations.application.banklogo.BankLogoRefreshService;
import cz.novanadeje.app.donations.application.banklogo.BankLogoUnavailable;
import cz.novanadeje.app.donations.application.banklogo.FetchedBankLogo;
import cz.novanadeje.app.donations.domain.bankcode.BankCode;
import cz.novanadeje.app.donations.domain.banklogo.BankLogoFailure;
import cz.novanadeje.app.support.FakeBankLogoSource;
import cz.novanadeje.app.support.MutableClock;
import io.cucumber.datatable.DataTable;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.simple.JdbcClient;
import tools.jackson.databind.JsonNode;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

public class BankLogosStepDefinitions {

    private static final String ADMIN_PATH = "/api/admin/donations/bank-logos";
    private static final String PUBLIC_PATH = "/api/donations/bank-logos";
    private static final String IMAGES_PATH = PUBLIC_PATH + "/images/";
    private static final String ACCESS_TOKEN = "access_token";
    private static final List<String> ACTIONS = List.of("SET_BANK_LOGO_SOURCE", "REFRESH_BANK_LOGO", "REMOVE_BANK_LOGO");

    private final ApiClient api;
    private final DonorSessions sessions;
    private final JdbcClient jdbc;
    private final FakeBankLogoSource source;
    private final BankLogoRefreshService refreshes;
    private final MutableClock clock;
    private String exchangedApiToken;
    private UUID rememberedImage;

    public BankLogosStepDefinitions(ApiClient api, DonorSessions sessions, JdbcClient jdbc, FakeBankLogoSource source, BankLogoRefreshService refreshes,
            MutableClock clock) {
        this.api = api;
        this.sessions = sessions;
        this.jdbc = jdbc;
        this.source = source;
        this.refreshes = refreshes;
        this.clock = clock;
    }

    @Given("the logo address {string} serves the picture {string}")
    public void theLogoAddressServesThePicture(String url, String picture) {
        source.serve(url, picture);
    }

    @Given("the logo address {string} fails with {string}")
    public void theLogoAddressFailsWith(String url, String failure) {
        source.failWith(url, BankLogoFailure.ofWord(failure));
    }

    @Given("the logo of bank {string} was stored from {string} with the picture {string}")
    public void theLogoWasStoredFrom(String code, String url, String picture) {
        byte[] webp = FakeBankLogoSource.webpOf(picture);
        UUID imageId = UUID.randomUUID();
        jdbc.sql("insert into bank_logo_image (id, sha256, webp) values (?, ?, ?)").params(imageId, FetchedBankLogo.of(webp).sha256(), webp).update();
        Timestamp now = Timestamp.from(clock.instant());
        jdbc.sql("insert into bank_logo (code, source_url, image_id, fetched_at, checked_at) values (?, ?, ?, ?, ?)")
                .params(code, url, imageId, now, now).update();
    }

    @Given("{string} has set the logo of bank {string} from {string}")
    public void hasSetTheLogo(String alias, String code, String url) {
        setsTheLogoAsANewOne(alias, code, url);
        assertThat(api.lastResponse().getStatusCode().value()).withFailMessage("Setting the logo answered %s", api.lastResponse().getBody()).isEqualTo(200);
    }

    @When("{string} sets the logo of bank {string} to {string} as a new one")
    public void setsTheLogoAsANewOne(String alias, String code, String url) {
        sessions.actAs(alias);
        api.put(ADMIN_PATH + "/" + code, Map.of("sourceUrl", url), Map.of(HttpHeaders.IF_NONE_MATCH, "*"));
    }

    @When("{string} sets the logo of bank {string} to {string} over the version she read")
    public void setsTheLogoOverTheVersionSheRead(String alias, String code, String url) {
        String version = versionOf(alias, code);
        api.put(ADMIN_PATH + "/" + code, Map.of("sourceUrl", url), ApiClient.ifMatch(version));
    }

    @When("{string} sets the logo of bank {string} to {string} over the version {string}")
    public void setsTheLogoOverTheVersion(String alias, String code, String url, String version) {
        sessions.actAs(alias);
        api.put(ADMIN_PATH + "/" + code, Map.of("sourceUrl", url), ApiClient.ifMatch(version));
    }

    @When("{string} sets the logo of bank {string} to {string} without a version")
    public void setsTheLogoWithoutAVersion(String alias, String code, String url) {
        sessions.actAs(alias);
        api.put(ADMIN_PATH + "/" + code, Map.of("sourceUrl", url));
    }

    @When("{string} sets the logo of bank {string} to {string} with If-None-Match {string}")
    public void setsTheLogoWithIfNoneMatch(String alias, String code, String url, String ifNoneMatch) {
        sessions.actAs(alias);
        api.put(ADMIN_PATH + "/" + code, Map.of("sourceUrl", url), Map.of(HttpHeaders.IF_NONE_MATCH, ifNoneMatch));
    }

    @When("{string} refreshes the logo of bank {string}")
    public void refreshesTheLogo(String alias, String code) {
        sessions.actAs(alias);
        api.post(ADMIN_PATH + "/" + code + "/refresh", Map.of());
    }

    @When("{string} refreshes the logo of bank {string} {int} times")
    public void refreshesTheLogoTimes(String alias, String code, int times) {
        for (int time = 0; time < times; time++) {
            refreshesTheLogo(alias, code);
            assertThat(api.lastResponse().getStatusCode().value()).withFailMessage("Refresh %d answered %s", time + 1, api.lastResponse().getBody())
                    .isEqualTo(200);
        }
    }

    @When("{string} removes the logo of bank {string} over the version she read")
    public void removesTheLogoOverTheVersionSheRead(String alias, String code) {
        String version = versionOf(alias, code);
        api.delete(ADMIN_PATH + "/" + code, ApiClient.ifMatch(version));
    }

    @When("{string} removes the logo of bank {string} over the version {string}")
    public void removesTheLogoOverTheVersion(String alias, String code, String version) {
        sessions.actAs(alias);
        api.delete(ADMIN_PATH + "/" + code, ApiClient.ifMatch(version));
    }

    @When("{string} asks for the bank logos in the administration")
    public void asksForTheBankLogosInTheAdministration(String alias) {
        sessions.actAs(alias);
        api.get(ADMIN_PATH);
    }

    @When("someone without a token asks for the bank logos in the administration")
    public void someoneWithoutATokenAsksForTheBankLogosInTheAdministration() {
        api.forgetCredentials();
        api.get(ADMIN_PATH);
    }

    @When("the exchanged API token sets the logo of bank {string} to {string}")
    public void theExchangedApiTokenSetsTheLogo(String code, String url) {
        actAsExchangedApiToken();
        api.put(ADMIN_PATH + "/" + code, Map.of("sourceUrl", url));
    }

    @When("the exchanged API token refreshes the logo of bank {string}")
    public void theExchangedApiTokenRefreshesTheLogo(String code) {
        actAsExchangedApiToken();
        api.post(ADMIN_PATH + "/" + code + "/refresh", Map.of());
    }

    @When("the exchanged API token removes the logo of bank {string} over the version {string}")
    public void theExchangedApiTokenRemovesTheLogo(String code, String version) {
        actAsExchangedApiToken();
        api.delete(ADMIN_PATH + "/" + code, ApiClient.ifMatch(version));
    }

    @When("the exchanged API token asks for the bank logos in the administration")
    public void theExchangedApiTokenAsksForTheBankLogos() {
        actAsExchangedApiToken();
        api.get(ADMIN_PATH);
    }

    @When("the daily check of the bank logos runs")
    public void theDailyCheckOfTheBankLogosRuns() {
        for (BankCode code : refreshes.due()) {
            try {
                refreshes.refresh(code);
            } catch (BankLogoUnavailable unavailable) {
                assertThat(unavailable.failure()).isNotNull();
            }
        }
    }

    @When("someone without a token asks for the published bank logos")
    public void someoneWithoutATokenAsksForThePublishedBankLogos() {
        api.forgetCredentials();
        api.get(PUBLIC_PATH);
    }

    @When("{string} asks for the published bank logos")
    public void asksForThePublishedBankLogos(String alias) {
        sessions.actAs(alias);
        api.get(PUBLIC_PATH);
    }

    @When("someone without a token asks for the published bank logos {int} times")
    public void someoneWithoutATokenAsksForThePublishedBankLogosTimes(int times) {
        for (int time = 0; time < times; time++) {
            someoneWithoutATokenAsksForThePublishedBankLogos();
            assertThat(api.lastResponse().getStatusCode().value()).isEqualTo(200);
        }
    }

    @When("someone without a token asks for the image of the logo of bank {string}")
    public void someoneWithoutATokenAsksForTheImageOfTheLogo(String code) {
        api.forgetCredentials();
        api.getBytes(IMAGES_PATH + imageOf(code));
    }

    @When("the image of the logo of bank {string} is remembered")
    public void theImageOfTheLogoIsRemembered(String code) {
        rememberedImage = imageOf(code);
    }

    @When("someone without a token asks for the remembered logo image")
    public void someoneWithoutATokenAsksForTheRememberedLogoImage() {
        api.forgetCredentials();
        api.get(IMAGES_PATH + rememberedImage);
    }

    @When("someone without a token asks for a logo image that never existed")
    public void someoneWithoutATokenAsksForALogoImageThatNeverExisted() {
        api.forgetCredentials();
        api.get(IMAGES_PATH + "0192f4d2-1a6b-7c3d-9e8f-001122334455");
    }

    @Then("the administration lists these bank logos:")
    public void theAdministrationListsTheseBankLogos(DataTable expected) {
        List<Map<String, String>> wanted = expected.asMaps().stream().map(BankLogosStepDefinitions::withEmptyAsNull).toList();
        List<Map<String, String>> items = api.lastResponseJson().get("items").values().stream().map(BankLogosStepDefinitions::adminRow)
                .map(row -> onlyColumns(row, expected.row(0))).toList();
        assertThat(items).isEqualTo(wanted);
    }

    @Then("the answer is the bank logo of bank {string} from {string}")
    public void theAnswerIsTheBankLogo(String code, String url) {
        JsonNode row = api.lastResponseJson();
        assertThat(row.get("code").asString()).isEqualTo(code);
        assertThat(row.get("sourceUrl").asString()).isEqualTo(url);
        assertThat(row.get("version").asString()).matches("[0-9a-f]{16}");
        assertThat(row.get("imageId").asString()).isEqualTo(imageOf(code).toString());
    }

    @Then("the problem carries the current version and the logo from {string}")
    public void theProblemCarriesTheCurrentVersion(String url) {
        JsonNode problem = api.lastResponseJson();
        assertThat(problem.get("version").asString()).matches("[0-9a-f]{16}");
        assertThat(problem.get("current").get("sourceUrl").asString()).isEqualTo(url);
        assertThat(problem.get("current").get("version").asString()).isEqualTo(problem.get("version").asString());
    }

    @Then("the logo address {string} was asked {int} time(s)")
    public void theLogoAddressWasAsked(String url, int times) {
        assertThat(source.asked().stream().filter(url::equals).count()).isEqualTo(times);
    }

    @Then("no logo address was asked")
    public void noLogoAddressWasAsked() {
        assertThat(source.asked()).isEmpty();
    }

    @Then("the logo of bank {string} shows the picture {string}")
    public void theLogoShowsThePicture(String code, String picture) {
        byte[] webp = jdbc.sql("select image.webp from bank_logo logo join bank_logo_image image on image.id = logo.image_id where logo.code = ?")
                .param(code).query(byte[].class).single();
        assertThat(webp).isEqualTo(FakeBankLogoSource.webpOf(picture));
    }

    @Then("the logo of bank {string} was fetched at {string} and checked at {string}")
    public void theLogoWasFetchedAndCheckedAt(String code, String fetchedAt, String checkedAt) {
        Map<String, Instant> times = jdbc.sql("select fetched_at, checked_at from bank_logo where code = ?").param(code)
                .query((rows, number) -> Map.of("fetched", rows.getTimestamp("fetched_at").toInstant(), "checked", rows.getTimestamp("checked_at").toInstant()))
                .single();
        assertThat(times).isEqualTo(Map.of("fetched", Instant.parse(fetchedAt), "checked", Instant.parse(checkedAt)));
    }

    @Then("{int} bank logo image(s) is/are stored")
    public void bankLogoImagesAreStored(int count) {
        assertThat(jdbc.sql("select count(*) from bank_logo_image").query(Long.class).single()).isEqualTo(count);
    }

    @Then("the published bank logos are the ones of banks {string}")
    public void thePublishedBankLogosAre(String codes) {
        List<Map<String, String>> items = api.lastResponseJson().get("items").values().stream()
                .map(item -> Map.of("code", item.get("code").asString(), "imageId", item.get("imageId").asString()))
                .toList();
        List<Map<String, String>> expected = codes.isEmpty() ? List.of() : List.of(codes.split(",\\s*")).stream()
                .map(code -> Map.of("code", code, "imageId", imageOf(code).toString())).toList();
        assertThat(items).isEqualTo(expected);
    }

    @Then("the bank logo list may be kept privately for five minutes")
    public void theBankLogoListMayBeKeptPrivately() {
        assertThat(api.lastResponse().getHeaders().getCacheControl()).isEqualTo("private, max-age=300");
        assertThat(api.lastResponse().getHeaders().get(HttpHeaders.SET_COOKIE)).isNull();
    }

    @Then("the answer is the picture {string} as a WebP that may be kept for a year")
    public void theAnswerIsThePicture(String picture) {
        HttpHeaders headers = api.lastResponse().getHeaders();
        assertThat(api.lastResponseBytes()).isEqualTo(FakeBankLogoSource.webpOf(picture));
        assertThat(headers.getContentType()).hasToString("image/webp");
        assertThat(headers.getCacheControl()).isEqualTo("max-age=31536000, public, immutable");
        assertThat(headers.getFirst("X-Content-Type-Options")).isEqualTo("nosniff");
        assertThat(headers.get(HttpHeaders.SET_COOKIE)).isNull();
    }

    @Then("the bank logo admin actions were recorded:")
    public void theBankLogoAdminActionsWereRecorded(DataTable table) {
        List<Map<String, String>> recorded = jdbc.sql("select action, coalesce(client, '') as client, details from admin_action where action in (:actions)"
                        + " order by action, client, details")
                .param("actions", ACTIONS)
                .query((rows, number) -> Map.of("action", rows.getString("action"), "client", rows.getString("client"), "details", rows.getString("details")))
                .list();
        List<Map<String, String>> expected = table.asMaps().stream()
                .map(row -> Map.of("action", row.get("action"), "client", Optional.ofNullable(row.get("client")).orElse(""),
                        "details", Optional.ofNullable(row.get("details")).orElse("")))
                .sorted(Comparator.comparing((Map<String, String> row) -> row.get("action")).thenComparing(row -> row.get("client")))
                .toList();
        assertThat(recorded).hasSameSizeAs(expected);
        for (int index = 0; index < expected.size(); index++) {
            assertThat(recorded.get(index).get("action")).isEqualTo(expected.get(index).get("action"));
            assertThat(recorded.get(index).get("client")).isEqualTo(expected.get(index).get("client"));
            assertThat(recorded.get(index).get("details")).startsWith(expected.get(index).get("details"));
        }
    }

    @Then("no bank logo admin action was recorded")
    public void noBankLogoAdminActionWasRecorded() {
        assertThat(jdbc.sql("select count(*) from admin_action where action in (:actions)").param("actions", ACTIONS).query(Long.class).single()).isZero();
    }

    private String versionOf(String alias, String code) {
        asksForTheBankLogosInTheAdministration(alias);
        return api.lastResponseJson().get("items").values().stream().filter(item -> code.equals(item.get("code").asString())).findFirst()
                .map(item -> item.get("version").asString()).orElseThrow();
    }

    private UUID imageOf(String code) {
        return jdbc.sql("select image_id from bank_logo where code = ?").param(code).query(UUID.class).single();
    }

    private void actAsExchangedApiToken() {
        JsonNode last = api.lastResponseJson();
        if (last != null && last.has(ACCESS_TOKEN)) {
            exchangedApiToken = last.get(ACCESS_TOKEN).asString();
        }
        api.forgetCredentials();
        api.authorize(exchangedApiToken);
    }

    private static Map<String, String> adminRow(JsonNode item) {
        Map<String, String> row = new LinkedHashMap<>();
        row.put("code", item.get("code").asString());
        row.put("bankName", textOrNull(item.get("bankName")));
        row.put("sourceUrl", item.get("sourceUrl").asString());
        row.put("image", item.get("imageId").isNull() ? "no" : "yes");
        row.put("fetchedAt", textOrNull(item.get("fetchedAt")));
        row.put("checkedAt", textOrNull(item.get("checkedAt")));
        row.put("lastFailure", textOrNull(item.get("lastFailure")));
        row.put("sourceAllowed", textOrNull(item.get("sourceAllowed")));
        return row;
    }

    private static Map<String, String> onlyColumns(Map<String, String> row, List<String> columns) {
        Map<String, String> projected = new LinkedHashMap<>();
        columns.forEach(column -> projected.put(column, row.get(column)));
        return projected;
    }

    private static Map<String, String> withEmptyAsNull(Map<String, String> row) {
        Map<String, String> copy = new LinkedHashMap<>();
        row.forEach((key, value) -> copy.put(key, value == null || value.isEmpty() ? null : value));
        return copy;
    }

    private static String textOrNull(JsonNode node) {
        return node == null || node.isNull() ? null : node.asString();
    }
}
