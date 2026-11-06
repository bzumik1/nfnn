package cz.novanadeje.app.donations.cucumber;

import cz.novanadeje.app.cucumber.ApiClient;
import cz.novanadeje.app.cucumber.ConcurrentWrites;
import cz.novanadeje.app.cucumber.DonorSessions;
import cz.novanadeje.app.cucumber.ScenarioDonors;
import cz.novanadeje.app.shared.infrastructure.lock.AdvisoryLock;
import io.cucumber.datatable.DataTable;
import io.cucumber.java.en.When;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class StaleAdminWritesStepDefinitions {

    private static final String PAYMENTS = "/api/admin/donations/payments/";
    private static final String DONORS = "/api/admin/donations/donors/";
    private static final String CLAIMS = "/api/admin/donations/symbol-claims/";
    private static final String REPORT_SETTINGS = "/api/admin/donations/report/settings";
    private static final Pattern PAIR = Pattern.compile("pairs payment (\\d+) with (\\w+)");
    private static final Pattern UNPAIR = Pattern.compile("unpairs payment (\\d+)");
    private static final Pattern DISCONNECT = Pattern.compile("turns off bank account ([\\d/-]+) of (\\w+)");
    private static final Pattern RECONNECT = Pattern.compile("turns on bank account ([\\d/-]+) of (\\w+)");
    private static final Pattern REMOVE = Pattern.compile("removes bank account ([\\d/-]+) of (\\w+)");
    private static final Pattern REVERSE = Pattern.compile("reverses the symbol answer of (\\w+) to (\\d+)");
    private static final Pattern RESET = Pattern.compile("deletes the symbol answer of (\\w+) to (\\d+)");
    private static final Pattern REPORT = Pattern.compile("sends the monthly report on day (\\d+)");
    private static final String ADVISORY_LOCK = "select pg_advisory_xact_lock(?)";

    private final ApiClient api;
    private final DonorSessions sessions;
    private final ScenarioDonors scenarioDonors;
    private final JdbcClient jdbc;
    private final DonationRowVersions versions;
    private final ConcurrentWrites concurrentWrites;
    private final Map<String, String> readVersions = new HashMap<>();

    public StaleAdminWritesStepDefinitions(ApiClient api, DonorSessions sessions, ScenarioDonors scenarioDonors, JdbcClient jdbc,
                                           DonationRowVersions versions, ConcurrentWrites concurrentWrites) {
        this.api = api;
        this.sessions = sessions;
        this.scenarioDonors = scenarioDonors;
        this.jdbc = jdbc;
        this.versions = versions;
        this.concurrentWrites = concurrentWrites;
    }

    @When("these writes start one after another from the versions read before them, while the pairing lock is held:")
    public void theseWritesStartWhileThePairingLockIsHeld(DataTable table) {
        sendWhileHeld(AdvisoryLock.PAIRING, table);
    }

    @When("these writes start one after another from the versions read before them, while the report settings lock is held:")
    public void theseWritesStartWhileTheReportSettingsLockIsHeld(DataTable table) {
        sendWhileHeld(AdvisoryLock.REPORT_SETTINGS_CHANGES, table);
    }

    private void sendWhileHeld(AdvisoryLock lock, DataTable table) {
        List<ConcurrentWrites.Write> writes = table.asMaps().stream().map(row -> write(row.get("who"), row.get("write"))).toList();
        concurrentWrites.sendWhileHeld(ADVISORY_LOCK, lock.key(), writes);
    }

    @When("{string} reads payment {long}")
    public void readsPayment(String alias, long transactionId) {
        readVersions.put(alias + "/payment/" + transactionId, versions.ofPayment(paymentId(transactionId)));
    }

    @When("{string} unpairs payment {long} from the version read before")
    public void unpairsPaymentFromTheVersionReadBefore(String alias, long transactionId) {
        sessions.actAs(alias);
        api.post(PAYMENTS + paymentId(transactionId) + "/unpair", null, ApiClient.ifMatch(readVersions.get(alias + "/payment/" + transactionId)));
    }

    @When("{string} pairs payment {long} with {string} from the version read before")
    public void pairsPaymentFromTheVersionReadBefore(String alias, long transactionId, String donorAlias) {
        sessions.actAs(alias);
        api.post(PAYMENTS + paymentId(transactionId) + "/pair", Map.of("donorId", scenarioDonors.idOf(donorAlias).toString()),
                ApiClient.ifMatch(readVersions.get(alias + "/payment/" + transactionId)));
    }

    @When("{string} pairs payment {long} with {string} naming no version")
    public void pairsPaymentNamingNoVersion(String alias, long transactionId, String donorAlias) {
        sessions.actAs(alias);
        api.post(PAYMENTS + paymentId(transactionId) + "/pair", Map.of("donorId", scenarioDonors.idOf(donorAlias).toString()));
    }

    @When("{string} pairs payment {long} without naming a donor or a version")
    public void pairsPaymentWithoutNamingADonorOrAVersion(String alias, long transactionId) {
        sessions.actAs(alias);
        api.post(PAYMENTS + paymentId(transactionId) + "/pair", Map.of());
    }

    @When("{string} pairs payment {long} with {string} naming the version {string}")
    public void pairsPaymentNamingTheVersion(String alias, long transactionId, String donorAlias, String ifMatch) {
        sessions.actAs(alias);
        api.post(PAYMENTS + paymentId(transactionId) + "/pair", Map.of("donorId", scenarioDonors.idOf(donorAlias).toString()),
                Map.of(HttpHeaders.IF_MATCH, ifMatch));
    }

    private ConcurrentWrites.Write write(String alias, String phrase) {
        String bearer = sessions.bearerOf(alias);
        Matcher matched;
        if ((matched = PAIR.matcher(phrase)).matches()) {
            UUID payment = paymentId(Long.parseLong(matched.group(1)));
            return write(bearer, HttpMethod.POST, PAYMENTS + payment + "/pair", Map.of("donorId", scenarioDonors.idOf(matched.group(2)).toString()),
                    () -> versions.ofPayment(payment));
        }
        if ((matched = UNPAIR.matcher(phrase)).matches()) {
            UUID payment = paymentId(Long.parseLong(matched.group(1)));
            return write(bearer, HttpMethod.POST, PAYMENTS + payment + "/unpair", null, () -> versions.ofPayment(payment));
        }
        if ((matched = DISCONNECT.matcher(phrase)).matches()) {
            return linkWrite(bearer, HttpMethod.POST, matched, "/disconnect");
        }
        if ((matched = RECONNECT.matcher(phrase)).matches()) {
            return linkWrite(bearer, HttpMethod.POST, matched, "/reconnect");
        }
        if ((matched = REMOVE.matcher(phrase)).matches()) {
            return linkWrite(bearer, HttpMethod.DELETE, matched, "");
        }
        if ((matched = REVERSE.matcher(phrase)).matches()) {
            UUID claim = claimOf(matched.group(1), matched.group(2));
            return write(bearer, HttpMethod.POST, CLAIMS + claim + "/reverse", Map.of(), () -> versions.ofSymbolClaim(claim));
        }
        if ((matched = RESET.matcher(phrase)).matches()) {
            UUID claim = claimOf(matched.group(1), matched.group(2));
            return write(bearer, HttpMethod.DELETE, CLAIMS + claim, null, () -> versions.ofSymbolClaim(claim));
        }
        if ((matched = REPORT.matcher(phrase)).matches()) {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("recipients", List.of("info@nfnn.cz"));
            body.put("sendDay", Integer.parseInt(matched.group(1)));
            body.put("sendHour", 7);
            body.put("sections", Map.of("donors", true, "donations", false, "unpairedPayments", false, "bankImport", false));
            return write(bearer, HttpMethod.PUT, REPORT_SETTINGS, body, versions::ofReportSettings);
        }
        throw new IllegalArgumentException("No such write: " + phrase);
    }

    private ConcurrentWrites.Write linkWrite(String bearer, HttpMethod method, Matcher matched, String action) {
        UUID donor = scenarioDonors.idOf(matched.group(2));
        DonationRowVersions.VersionedLink link = versions.ofLink(donor, matched.group(1));
        return write(bearer, method, DONORS + donor + "/bank-accounts/" + link.id() + action, method == HttpMethod.DELETE ? null : Map.of(),
                () -> versions.ofLink(donor, matched.group(1)).version());
    }

    private static ConcurrentWrites.Write write(String bearer, HttpMethod method, String path, Map<String, ?> body, Supplier<String> versionNow) {
        String read = versionNow.get();
        Map<String, String> headers = new LinkedHashMap<>();
        headers.put(HttpHeaders.AUTHORIZATION, bearer);
        headers.putAll(ApiClient.ifMatch(read));
        return new ConcurrentWrites.Write(new ApiClient.PreparedRequest(method, path, body, headers), read, versionNow);
    }

    private UUID paymentId(long transactionId) {
        return jdbc.sql("select id from bank_payment where bank_transaction_id = ?").param(transactionId).query(UUID.class).single();
    }

    private UUID claimOf(String donorAlias, String symbol) {
        return jdbc.sql("select id from donor_symbol_claim where donor_id = ? and variable_symbol = ?").param(scenarioDonors.idOf(donorAlias)).param(symbol)
                .query(UUID.class).single();
    }
}
