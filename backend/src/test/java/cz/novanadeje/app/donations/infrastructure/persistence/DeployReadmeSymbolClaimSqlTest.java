package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.TestcontainersConfiguration;
import cz.novanadeje.app.donations.application.bankaccount.DonorBankAccountsService;
import cz.novanadeje.app.donations.application.bankaccount.SymbolClaimConfirmation;
import cz.novanadeje.app.donations.application.bankaccount.SymbolClaimService;
import cz.novanadeje.app.donations.application.pairing.PairingOutcome;
import cz.novanadeje.app.donations.application.pairing.PaymentPairingService;
import cz.novanadeje.app.donations.application.receipt.DonationReceiptService;
import cz.novanadeje.app.donations.domain.bank.BankPaymentRepository;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.donation.DonationId;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLinkId;
import cz.novanadeje.app.donations.domain.receipt.ReceiptNumber;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.Money;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.UuidV7;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import cz.novanadeje.app.support.DatabaseCleaner;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.testcontainers.containers.Container.ExecResult;
import org.testcontainers.images.builder.Transferable;
import org.testcontainers.postgresql.PostgreSQLContainer;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalDate;
import java.time.Year;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static cz.novanadeje.app.donations.BankPayments.payment;
import static org.assertj.core.api.Assertions.assertThat;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {"app.donations.fio.token=", "app.donations.report.cron=-", "app.contact.retention.cron=-",
        "app.donations.receipt.first-year=2025"})
class DeployReadmeSymbolClaimSqlTest {

    private static final Path README = Path.of("../deploy/README.md");
    private static final Pattern PSQL_CALL = Pattern.compile("sudo docker exec -i nfnn-backup psql (.+) <<'SQL'");
    private static final Pattern ADVISORY_LOCK = Pattern.compile("pg_advisory_xact_lock\\((\\d+)\\)");
    private static final List<String> BLOCKS = List.of("symbol-claim-list", "symbol-claim-reverse", "symbol-claim-reset", "symbol-claim-names",
            "sender-account-links");
    private static final String CLAIM_PLACEHOLDER = "ID_VAZBY";
    private static final String RECEIPT_REFUSAL = "Na dary z této vazby odkazuje vydané potvrzení o daru, vazbu nejde zrušit";
    private static final SenderAccount ACCOUNT = new SenderAccount("1234567", "0800");
    private static final String JANAS_SYMBOL = "4821937560";
    private static final VariableSymbol OLD_SYMBOL = new VariableSymbol("6123456789");
    private static final Year YEAR_2025 = Year.of(2025);

    @Autowired
    private PostgreSQLContainer postgres;
    @Autowired
    private SymbolClaimService symbolClaims;
    @Autowired
    private DonorBankAccountsService bankAccounts;
    @Autowired
    private PaymentPairingService pairing;
    @Autowired
    private DonationReceiptService receipts;
    @Autowired
    private DonorRecordRepository donorRecords;
    @Autowired
    private BankPaymentRepository payments;
    @Autowired
    private JdbcClient jdbc;

    @AfterEach
    void cleanTables() {
        new DatabaseCleaner(jdbc).truncateAllTables();
    }

    @Test
    @DisplayName("Given a confirmed claim whose donations only a yearly receipt issued before them could cover, when the README reversal runs, then the claim's donations are deleted, the answer becomes DECLINED, a pairing run pairs nothing, the account asks nothing and the earlier yearly receipt is served again")
    void should_delete_claimed_donations_and_decline_when_reversed_given_yearly_receipt_issued_before_them() throws Exception {
        DonorReference jana = janaWithVerifiedAccountAndOldSymbolPayments();
        ReceiptNumber issuedBefore = receipts.yearlyReceipt(jana, YEAR_2025).number();
        SymbolClaimConfirmation confirmation = confirmOldSymbol(jana);
        assertThat(confirmation.pairedCount()).isEqualTo(3);
        assertThat(confirmation.changedYearlyReceipts()).containsExactly(YEAR_2025);
        UUID claim = claimOf(jana);

        ExecResult reversal = psql("symbol-claim-reverse", claim);

        assertThat(reversal.getExitCode()).as(reversal.getStderr()).isZero();
        assertThat(reversal.getStdout()).contains("DELETE 3", "UPDATE 1", "COMMIT");
        assertThat(donationsPairedBy(claim)).isZero();
        assertThat(answerOf(claim)).isEqualTo("DECLINED");
        assertThat(donationsOf(jana)).isEqualTo(2);
        PairingOutcome rerun = pairing.pairUnpaired(Instant.now());
        assertThat(rerun.pairedBySymbol() + rerun.pairedByAccount() + rerun.pairedByConfirmedSymbol()).isZero();
        assertThat(rerun.leftUnpaired()).isEqualTo(3);
        assertThat(bankAccounts.listBankAccounts(jana)).singleElement().satisfies(row -> {
            assertThat(row.symbolOffer()).isEmpty();
            assertThat(row.confirmedSymbols()).isEmpty();
        });
        assertThat(receipts.yearlyReceipt(jana, YEAR_2025).number()).isEqualTo(issuedBefore);
    }

    @Test
    @DisplayName("Given a confirmed claim and a single receipt issued for one of its donations, when the README reversal runs, then psql stops with the receipt error and the donations and the confirmed answer stay")
    void should_change_nothing_when_reversed_given_single_receipt_of_claimed_donation() throws Exception {
        DonorReference jana = janaWithVerifiedAccountAndOldSymbolPayments();
        confirmOldSymbol(jana);
        UUID claim = claimOf(jana);
        receipts.singleReceipt(jana, new DonationId(jdbc.sql("select id from donation where symbol_claim_id = ? order by received_on desc limit 1")
                .param(claim).query(UUID.class).single()));

        ExecResult reversal = psql("symbol-claim-reverse", claim);

        assertThat(reversal.getExitCode()).isNotZero();
        assertThat(reversal.getStderr()).contains(RECEIPT_REFUSAL);
        assertThat(donationsPairedBy(claim)).isEqualTo(3);
        assertThat(answerOf(claim)).isEqualTo("CONFIRMED");
    }

    @Test
    @DisplayName("Given a confirmed claim and a yearly receipt issued after its donations were paired, when the README reversal runs, then psql stops with the receipt error and the donations and the confirmed answer stay")
    void should_change_nothing_when_reversed_given_yearly_receipt_issued_after_claimed_donations() throws Exception {
        DonorReference jana = janaWithVerifiedAccountAndOldSymbolPayments();
        confirmOldSymbol(jana);
        UUID claim = claimOf(jana);
        receipts.yearlyReceipt(jana, YEAR_2025);

        ExecResult reversal = psql("symbol-claim-reverse", claim);

        assertThat(reversal.getExitCode()).isNotZero();
        assertThat(reversal.getStderr()).contains(RECEIPT_REFUSAL);
        assertThat(donationsPairedBy(claim)).isEqualTo(3);
        assertThat(answerOf(claim)).isEqualTo("CONFIRMED");
    }

    @Test
    @DisplayName("Given a declined claim, when the README reversal runs with its id, then psql stops because no confirmed claim has that id and the answer stays")
    void should_stop_when_reversed_given_declined_claim() throws Exception {
        DonorReference jana = janaWithVerifiedAccountAndOldSymbolPayments();
        symbolClaims.decline(jana, linkOf(jana), OLD_SYMBOL);
        UUID claim = claimOf(jana);

        ExecResult reversal = psql("symbol-claim-reverse", claim);

        assertThat(reversal.getExitCode()).isNotZero();
        assertThat(reversal.getStderr()).contains("Potvrzená vazba s tímto id neexistuje");
        assertThat(answerOf(claim)).isEqualTo("DECLINED");
    }

    @Test
    @DisplayName("Given a declined claim, when the README reset runs with its id, then the answer is deleted and the account asks about the symbol again")
    void should_ask_again_when_reset_given_declined_claim() throws Exception {
        DonorReference jana = janaWithVerifiedAccountAndOldSymbolPayments();
        symbolClaims.decline(jana, linkOf(jana), OLD_SYMBOL);
        UUID claim = claimOf(jana);

        ExecResult reset = psql("symbol-claim-reset", claim);

        assertThat(reset.getExitCode()).as(reset.getStderr()).isZero();
        assertThat(reset.getStdout()).contains("DELETE 1");
        assertThat(jdbc.sql("select count(*) from donor_symbol_claim").query(Long.class).single()).isZero();
        assertThat(bankAccounts.listBankAccounts(jana)).singleElement().satisfies(row -> assertThat(row.symbolOffer())
                .hasValueSatisfying(offer -> {
                    assertThat(offer.symbol()).isEqualTo(OLD_SYMBOL);
                    assertThat(offer.paymentCount()).isEqualTo(3);
                    assertThat(offer.firstMonth()).isEqualTo(YearMonth.of(2025, 3));
                    assertThat(offer.lastMonth()).isEqualTo(YearMonth.of(2026, 3));
                }));
    }

    @Test
    @DisplayName("Given a confirmed claim, when the README reset runs with its id, then nothing is deleted and its donations stay")
    void should_delete_nothing_when_reset_given_confirmed_claim() throws Exception {
        DonorReference jana = janaWithVerifiedAccountAndOldSymbolPayments();
        confirmOldSymbol(jana);
        UUID claim = claimOf(jana);

        ExecResult reset = psql("symbol-claim-reset", claim);

        assertThat(reset.getExitCode()).as(reset.getStderr()).isZero();
        assertThat(reset.getStdout()).contains("DELETE 0");
        assertThat(answerOf(claim)).isEqualTo("CONFIRMED");
        assertThat(donationsPairedBy(claim)).isEqualTo(3);
    }

    @Test
    @DisplayName("Given a confirmed claim, when the README listing runs, then it shows the claim's id, donor, account, symbol, answer and its three donations")
    void should_show_claim_with_its_donations_when_listed_given_confirmed_claim() throws Exception {
        DonorReference jana = janaWithVerifiedAccountAndOldSymbolPayments();
        confirmOldSymbol(jana);
        UUID claim = claimOf(jana);

        ExecResult listing = psql("symbol-claim-list");

        assertThat(listing.getExitCode()).as(listing.getStderr()).isZero();
        assertThat(listing.getStdout().lines().filter(line -> line.contains(claim.toString())))
                .singleElement()
                .satisfies(line -> assertThat(line).contains("Jana Nováková", "1234567/0800", OLD_SYMBOL.value(), "CONFIRMED").matches(".*\\|\\s+3\\s*"));
    }

    @Test
    @DisplayName("Given a verified account, when the README checks before the deploy run, then they list the bank's names on verification payments with the donor type and the donors' account links")
    void should_list_names_and_links_when_checked_given_verified_account() throws Exception {
        janaWithVerifiedAccountAndOldSymbolPayments();

        ExecResult names = psql("symbol-claim-names");
        ExecResult links = psql("sender-account-links");

        assertThat(names.getExitCode()).as(names.getStderr()).isZero();
        assertThat(names.getStdout().lines().filter(line -> line.contains("Nováková Jana"))).singleElement()
                .satisfies(line -> assertThat(line).contains("PERSON"));
        assertThat(links.getExitCode()).as(links.getStderr()).isZero();
        assertThat(links.getStdout().lines().filter(line -> line.contains("1234567/0800"))).singleElement()
                .satisfies(line -> assertThat(line).contains("Jana Nováková", "ACTIVE"));
    }

    @Test
    @DisplayName("Given the README's SQL blocks, when they are read, then each stops at the first error and the reversal takes the advisory lock every pairing writer takes")
    void should_stop_on_error_and_take_pairing_lock_when_read_given_readme_blocks() throws IOException {
        for (String name : BLOCKS) {
            assertThat(PsqlBlock.named(name).options()).as(name).containsSequence("-v", "ON_ERROR_STOP=1");
        }

        Matcher lock = ADVISORY_LOCK.matcher(PsqlBlock.named("symbol-claim-reverse").script());

        assertThat(lock.find()).isTrue();
        assertThat(Long.parseLong(lock.group(1))).isEqualTo(PostgresPairingLock.KEY);
        assertThat(lock.find()).isFalse();
    }

    private DonorReference janaWithVerifiedAccountAndOldSymbolPayments() {
        Instant now = Instant.now();
        DonorRecord jana = DonorRecord.registerPerson(new DonorReference(UuidV7.generate(now)), "Jana Nováková",
                new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"), new VariableSymbol(JANAS_SYMBOL), LocaleCode.CS, now);
        donorRecords.save(jana);
        Optional<SenderAccount> account = Optional.of(ACCOUNT);
        payments.saveAll(List.of(
                payment(9001, LocalDate.of(2025, 1, 10), Money.czk(30000), account, JANAS_SYMBOL),
                payment(9002, LocalDate.of(2025, 3, 15), Money.czk(50000), account, OLD_SYMBOL.value()),
                payment(9003, LocalDate.of(2025, 9, 15), Money.czk(50000), account, OLD_SYMBOL.value()),
                payment(9004, LocalDate.of(2026, 3, 15), Money.czk(50000), account, OLD_SYMBOL.value()),
                payment(9005, LocalDate.of(2026, 9, 1), Money.czk(100), account, JANAS_SYMBOL, "OVERENI UCTU NADACNI FOND NOVA NADEJE")));
        pairing.pairUnpaired(now);
        return jana.id();
    }

    private SymbolClaimConfirmation confirmOldSymbol(DonorReference donor) {
        return symbolClaims.confirm(donor, linkOf(donor), OLD_SYMBOL);
    }

    private SenderAccountLinkId linkOf(DonorReference donor) {
        return bankAccounts.listBankAccounts(donor).getFirst().link().id();
    }

    private UUID claimOf(DonorReference donor) {
        return jdbc.sql("select id from donor_symbol_claim where donor_id = ?").param(donor.value()).query(UUID.class).single();
    }

    private String answerOf(UUID claim) {
        return jdbc.sql("select answer from donor_symbol_claim where id = ?").param(claim).query(String.class).single();
    }

    private long donationsPairedBy(UUID claim) {
        return jdbc.sql("select count(*) from donation where symbol_claim_id = ?").param(claim).query(Long.class).single();
    }

    private long donationsOf(DonorReference donor) {
        return jdbc.sql("select count(*) from donation where donor_id = ?").param(donor.value()).query(Long.class).single();
    }

    private ExecResult psql(String name) throws IOException, InterruptedException {
        PsqlBlock block = PsqlBlock.named(name);
        assertThat(block.options()).as(name).noneMatch(option -> option.contains(CLAIM_PLACEHOLDER));
        return run(name, block.options(), block.script());
    }

    private ExecResult psql(String name, UUID claim) throws IOException, InterruptedException {
        PsqlBlock block = PsqlBlock.named(name);
        assertThat(block.options()).as(name).contains("claim=" + CLAIM_PLACEHOLDER);
        return run(name, block.options().stream().map(option -> option.replace(CLAIM_PLACEHOLDER, claim.toString())).toList(), block.script());
    }

    private ExecResult run(String name, List<String> options, String script) throws IOException, InterruptedException {
        String file = "/tmp/" + name + ".sql";
        postgres.copyFileToContainer(Transferable.of(script.getBytes(StandardCharsets.UTF_8)), file);
        List<String> command = new ArrayList<>(List.of("psql", "-U", postgres.getUsername(), "-d", postgres.getDatabaseName()));
        command.addAll(options);
        command.addAll(List.of("-f", file));
        return postgres.execInContainer(command.toArray(String[]::new));
    }

    private record PsqlBlock(List<String> options, String script) {

        static PsqlBlock named(String name) throws IOException {
            String readme = Files.readString(README);
            String start = "<!-- " + name + ":start -->\n";
            String end = "\n<!-- " + name + ":end -->";
            int from = readme.indexOf(start);
            int to = readme.indexOf(end, from);
            assertThat(from).as("README block " + name).isNotNegative();
            assertThat(to).as("README block " + name).isPositive();
            List<String> lines = readme.substring(from + start.length(), to).lines().toList();
            assertThat(lines.getFirst()).isEqualTo("```bash");
            assertThat(lines.getLast()).isEqualTo("```");
            Matcher call = PSQL_CALL.matcher(lines.get(1));
            assertThat(call.matches()).as(lines.get(1)).isTrue();
            assertThat(lines.get(lines.size() - 2)).isEqualTo("SQL");
            return new PsqlBlock(Stream.of(call.group(1).split(" ")).toList(),
                    String.join("\n", lines.subList(2, lines.size() - 2)) + "\n");
        }
    }
}
