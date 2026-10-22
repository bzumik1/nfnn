package cz.novanadeje.app.donations.cucumber;

import cz.novanadeje.app.cucumber.ScenarioDonors;
import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.bank.BankPaymentId;
import cz.novanadeje.app.donations.domain.bank.BankPaymentRepository;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donation.PairingMethod;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.donor.ExcludedSenderAccounts;
import cz.novanadeje.app.donations.domain.donor.SenderAccountLink;
import cz.novanadeje.app.shared.domain.Currency;
import cz.novanadeje.app.shared.domain.Money;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

public class PaymentPairingStepDefinitions {

    private final ScenarioDonors scenarioDonors;
    private final DonationRepository donations;
    private final DonorRecordRepository donorRecords;
    private final BankPaymentRepository payments;
    private final JdbcClient jdbc;
    private final Clock clock;

    public PaymentPairingStepDefinitions(ScenarioDonors scenarioDonors, DonationRepository donations, DonorRecordRepository donorRecords,
                                         BankPaymentRepository payments, JdbcClient jdbc, Clock clock) {
        this.scenarioDonors = scenarioDonors;
        this.donations = donations;
        this.donorRecords = donorRecords;
        this.payments = payments;
        this.jdbc = jdbc;
        this.clock = clock;
    }

    @Given("{string} learned the sender account of bank payment {long} before it was excluded")
    public void learnedTheSenderAccountBeforeItWasExcluded(String alias, long transactionId) {
        DonorRecord record = recordOf(alias);
        BankPayment payment = payments.findById(new BankPaymentId(jdbc.sql("select id from bank_payment where bank_transaction_id = ?")
                .param(transactionId).query(UUID.class).single())).orElseThrow();
        SenderAccountLink link = record.learnSenderAccountFrom(payment, Optional.empty(), ExcludedSenderAccounts.none(), clock.instant())
                .orElseThrow(() -> new AssertionError("Bank payment " + transactionId + " teaches \"" + alias + "\" no sender account"));
        assertThat(donorRecords.saveSenderAccountLink(record.id(), link)).isTrue();
    }

    @Then("{string} has {int} donation(s)")
    public void hasDonations(String alias, int count) {
        assertThat(donationsOf(alias)).hasSize(count);
    }

    @Then("{string} has a donation of {string} CZK received on {date} paired by variable symbol")
    public void hasADonationPairedByVariableSymbol(String alias, String amount, LocalDate receivedOn) {
        assertDonation(alias, amount, receivedOn, PairingMethod.VARIABLE_SYMBOL);
    }

    @Then("{string} has a donation of {string} CZK received on {date} paired by sender account")
    public void hasADonationPairedBySenderAccount(String alias, String amount, LocalDate receivedOn) {
        assertDonation(alias, amount, receivedOn, PairingMethod.SENDER_ACCOUNT);
    }

    @Then("{string} has a donation of {string} CZK received on {date} paired by confirmed symbol")
    public void hasADonationPairedByConfirmedSymbol(String alias, String amount, LocalDate receivedOn) {
        assertDonation(alias, amount, receivedOn, PairingMethod.CONFIRMED_SYMBOL);
    }

    @Then("bank payment {long} is paired with {string}")
    public void bankPaymentIsPairedWith(long transactionId, String alias) {
        assertThat(donorsPaidBy(transactionId)).containsExactly(scenarioDonors.idOf(alias));
    }

    @Then("bank payment {long} is paired with {string} by confirmed symbol")
    public void bankPaymentIsPairedWithByConfirmedSymbol(long transactionId, String alias) {
        UUID donor = scenarioDonors.idOf(alias);
        List<ConfirmedSymbolPair> pairs = jdbc.sql("""
                        select d.donor_id, d.paired_by,
                               c.donor_id as claimant, c.answer, c.account_number || '/' || c.bank_code as claimed_account,
                               c.variable_symbol as claimed_symbol,
                               a.donor_id as link_owner, a.account_number || '/' || a.bank_code as linked_account,
                               p.sender_account_number || '/' || p.sender_bank_code as sender, p.matching_variable_symbol
                        from donation d
                        join bank_payment p on p.id = d.bank_payment_id
                        left join donor_symbol_claim c on c.id = d.symbol_claim_id
                        left join donor_sender_account a on a.id = d.sender_account_id
                        where p.bank_transaction_id = ?""")
                .param(transactionId)
                .query((row, number) -> new ConfirmedSymbolPair(row.getObject("donor_id", UUID.class), row.getString("paired_by"),
                        row.getObject("claimant", UUID.class), row.getString("answer"), row.getString("claimed_account"),
                        row.getString("claimed_symbol"), row.getObject("link_owner", UUID.class), row.getString("linked_account"),
                        row.getString("sender"), row.getString("matching_variable_symbol")))
                .list();
        assertThat(pairs).withFailMessage("Bank payment %d has %d donations", transactionId, pairs.size()).hasSize(1);
        ConfirmedSymbolPair pair = pairs.getFirst();
        assertThat(pair.donor()).isEqualTo(donor);
        assertThat(pair.pairedBy()).isEqualTo(PairingMethod.CONFIRMED_SYMBOL.name());
        assertThat(pair.claimant()).isEqualTo(donor);
        assertThat(pair.answer()).isEqualTo("CONFIRMED");
        assertThat(pair.claimedAccount()).isEqualTo(pair.sender());
        assertThat(pair.claimedSymbol()).isEqualTo(pair.matchingSymbol());
        assertThat(pair.linkOwner()).isEqualTo(donor);
        assertThat(pair.linkedAccount()).isEqualTo(pair.sender());
    }

    @Then("bank payment {long} is unpaired")
    public void bankPaymentIsUnpaired(long transactionId) {
        assertThat(jdbc.sql("select count(*) from bank_payment where bank_transaction_id = ?").param(transactionId).query(Long.class).single())
                .withFailMessage("Bank payment %d is not stored", transactionId)
                .isEqualTo(1L);
        assertThat(donorsPaidBy(transactionId)).isEmpty();
    }

    @Then("{string} has learned sender account {string}")
    public void hasLearnedSenderAccount(String alias, String account) {
        assertThat(recordOf(alias).senderAccounts()).extracting(SenderAccount::display).contains(account);
    }

    @Then("{string} has learned no sender account")
    public void hasLearnedNoSenderAccount(String alias) {
        assertThat(recordOf(alias).senderAccounts()).isEmpty();
    }

    @Then("{string} has learned only sender account {string}")
    public void hasLearnedOnlySenderAccount(String alias, String account) {
        assertThat(recordOf(alias).senderAccountLinks()).extracting(link -> link.account().display()).containsExactly(account);
    }

    private void assertDonation(String alias, String amount, LocalDate receivedOn, PairingMethod method) {
        Money expected = Money.of(new BigDecimal(amount), Currency.CZK);
        assertThat(donationsOf(alias))
                .withFailMessage("\"%s\" has no donation of %s CZK received on %s paired by %s", alias, amount, receivedOn, method)
                .anySatisfy(donation -> {
                    assertThat(donation.amount()).isEqualTo(expected);
                    assertThat(donation.receivedOn()).isEqualTo(receivedOn);
                    assertThat(donation.pairedBy()).contains(method);
                });
    }

    private List<Donation> donationsOf(String alias) {
        return donations.findByDonorNewestFirst(new DonorReference(scenarioDonors.idOf(alias)));
    }

    private List<UUID> donorsPaidBy(long transactionId) {
        return jdbc.sql("select d.donor_id from donation d join bank_payment p on p.id = d.bank_payment_id where p.bank_transaction_id = ?")
                .param(transactionId)
                .query(UUID.class)
                .list();
    }

    private DonorRecord recordOf(String alias) {
        return donorRecords.findById(new DonorReference(scenarioDonors.idOf(alias)))
                .orElseThrow(() -> new AssertionError("Donations has no record of \"" + alias + "\""));
    }

    private record ConfirmedSymbolPair(UUID donor, String pairedBy, UUID claimant, String answer, String claimedAccount, String claimedSymbol,
                                       UUID linkOwner, String linkedAccount, String sender, String matchingSymbol) {
    }
}
