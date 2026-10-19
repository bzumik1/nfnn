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

    @Then("bank payment {long} is paired with {string}")
    public void bankPaymentIsPairedWith(long transactionId, String alias) {
        assertThat(donorsPaidBy(transactionId)).containsExactly(scenarioDonors.idOf(alias));
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
}
