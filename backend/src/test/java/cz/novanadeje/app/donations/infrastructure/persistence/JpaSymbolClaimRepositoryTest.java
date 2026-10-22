package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import cz.novanadeje.app.donations.domain.donor.SymbolClaim;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimAnswer;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimId;
import cz.novanadeje.app.donations.domain.donor.SymbolClaimRepository;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.UuidV7;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.time.Instant;

import static cz.novanadeje.app.donations.infrastructure.persistence.BankPersistenceTestConfiguration.NOW;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(BankPersistenceTestConfiguration.class)
class JpaSymbolClaimRepositoryTest {

    private static final SenderAccount ACCOUNT = new SenderAccount("1234567", "0800");
    private static final SenderAccount OTHER_ACCOUNT = new SenderAccount("19-2000145399", "0800");
    private static final VariableSymbol OLD_SYMBOL = new VariableSymbol("6123456789");
    private static final VariableSymbol OTHER_SYMBOL = new VariableSymbol("612345678");

    @Autowired
    private SymbolClaimRepository claims;
    @Autowired
    private DonorRecordRepository donorRecords;
    @Autowired
    private EntityManager entityManager;
    @Autowired
    private JdbcClient jdbc;

    @Test
    @DisplayName("Given an answered claim, when it is saved and read back, then every part survives")
    void should_keep_every_part_when_saved_and_read_given_claim() {
        DonorReference jana = storedDonor("4821937560");
        SymbolClaim claim = claim(jana, ACCOUNT, OLD_SYMBOL, SymbolClaimAnswer.CONFIRMED, NOW);

        assertThat(claims.saveIfAbsent(claim)).isTrue();
        flushAndClear();

        assertThat(claims.findByDonor(jana)).singleElement().satisfies(stored -> {
            assertThat(stored.id()).isEqualTo(claim.id());
            assertThat(stored.donor()).isEqualTo(jana);
            assertThat(stored.account()).isEqualTo(ACCOUNT);
            assertThat(stored.symbol()).isEqualTo(OLD_SYMBOL);
            assertThat(stored.answer()).isEqualTo(SymbolClaimAnswer.CONFIRMED);
            assertThat(stored.answeredAt()).isEqualTo(NOW);
        });
    }

    @Test
    @DisplayName("Given an answer stored for a donor, an account and a symbol, when a second answer for them is saved, then it is not saved and the first one stays")
    void should_keep_first_answer_when_second_saved_given_same_donor_account_and_symbol() {
        DonorReference jana = storedDonor("4821937560");
        SymbolClaim first = claim(jana, ACCOUNT, OLD_SYMBOL, SymbolClaimAnswer.CONFIRMED, NOW);
        claims.saveIfAbsent(first);
        flushAndClear();

        boolean saved = claims.saveIfAbsent(claim(jana, ACCOUNT, OLD_SYMBOL, SymbolClaimAnswer.DECLINED, NOW.plusSeconds(60)));
        flushAndClear();

        assertThat(saved).isFalse();
        assertThat(claims.findByDonor(jana)).singleElement().satisfies(stored -> {
            assertThat(stored.id()).isEqualTo(first.id());
            assertThat(stored.answer()).isEqualTo(SymbolClaimAnswer.CONFIRMED);
        });
    }

    @Test
    @DisplayName("Given claims of two donors for several accounts and symbols, when they are asked for by donor, by account and by the confirmed answer, then each query returns its own, oldest answer first")
    void should_find_claims_by_donor_account_and_answer_when_asked_given_several_claims() {
        DonorReference jana = storedDonor("4821937560");
        DonorReference petr = storedDonor("7310945528");
        SymbolClaim janaLater = claim(jana, ACCOUNT, OTHER_SYMBOL, SymbolClaimAnswer.DECLINED, NOW.plusSeconds(60));
        SymbolClaim janaFirst = claim(jana, ACCOUNT, OLD_SYMBOL, SymbolClaimAnswer.CONFIRMED, NOW);
        SymbolClaim janaOtherAccount = claim(jana, OTHER_ACCOUNT, OLD_SYMBOL, SymbolClaimAnswer.CONFIRMED, NOW.plusSeconds(120));
        SymbolClaim petrs = claim(petr, ACCOUNT, OLD_SYMBOL, SymbolClaimAnswer.DECLINED, NOW.plusSeconds(30));
        claims.saveIfAbsent(janaLater);
        claims.saveIfAbsent(janaFirst);
        claims.saveIfAbsent(janaOtherAccount);
        claims.saveIfAbsent(petrs);
        flushAndClear();

        assertThat(claims.findByDonor(jana)).extracting(SymbolClaim::id).containsExactly(janaFirst.id(), janaLater.id(), janaOtherAccount.id());
        assertThat(claims.findByAccount(ACCOUNT)).extracting(SymbolClaim::id).containsExactly(janaFirst.id(), petrs.id(), janaLater.id());
        assertThat(claims.findConfirmed()).extracting(SymbolClaim::id).containsExactly(janaFirst.id(), janaOtherAccount.id());
    }

    @Test
    @DisplayName("Given claims answered at different times, when all are listed, then the newest answer comes first and each is found by its id")
    void should_list_newest_first_and_find_by_id_when_asked_given_several_claims() {
        DonorReference jana = storedDonor("4821937560");
        DonorReference petr = storedDonor("7310945528");
        SymbolClaim janaFirst = claim(jana, ACCOUNT, OLD_SYMBOL, SymbolClaimAnswer.CONFIRMED, NOW);
        SymbolClaim petrs = claim(petr, ACCOUNT, OLD_SYMBOL, SymbolClaimAnswer.DECLINED, NOW.plusSeconds(30));
        SymbolClaim janaLater = claim(jana, OTHER_ACCOUNT, OTHER_SYMBOL, SymbolClaimAnswer.DECLINED, NOW.plusSeconds(60));
        claims.saveIfAbsent(janaFirst);
        claims.saveIfAbsent(petrs);
        claims.saveIfAbsent(janaLater);
        flushAndClear();

        assertThat(claims.findAllNewestFirst()).extracting(SymbolClaim::id).containsExactly(janaLater.id(), petrs.id(), janaFirst.id());
        assertThat(claims.findById(petrs.id())).hasValueSatisfying(stored -> assertThat(stored.donor()).isEqualTo(petr));
        assertThat(claims.findById(SymbolClaimId.newId(NOW))).isEmpty();
    }

    @Test
    @DisplayName("Given a confirmed claim, when its reversal is saved, then the stored answer is DECLINED from the reversal time and nothing else changes")
    void should_update_answer_when_reversal_saved_given_confirmed_claim() {
        DonorReference jana = storedDonor("4821937560");
        SymbolClaim claim = claim(jana, ACCOUNT, OLD_SYMBOL, SymbolClaimAnswer.CONFIRMED, NOW);
        claims.saveIfAbsent(claim);
        flushAndClear();

        claims.save(claim.reverse(NOW.plusSeconds(3600)));
        flushAndClear();

        assertThat(claims.findByDonor(jana)).singleElement().satisfies(stored -> {
            assertThat(stored.id()).isEqualTo(claim.id());
            assertThat(stored.account()).isEqualTo(ACCOUNT);
            assertThat(stored.symbol()).isEqualTo(OLD_SYMBOL);
            assertThat(stored.answer()).isEqualTo(SymbolClaimAnswer.DECLINED);
            assertThat(stored.answeredAt()).isEqualTo(NOW.plusSeconds(3600));
        });
    }

    @Test
    @DisplayName("Given a declined claim, when it is deleted, then the donor has no answer any more")
    void should_remove_claim_when_deleted_given_declined_claim() {
        DonorReference jana = storedDonor("4821937560");
        SymbolClaim claim = claim(jana, ACCOUNT, OLD_SYMBOL, SymbolClaimAnswer.DECLINED, NOW);
        claims.saveIfAbsent(claim);
        flushAndClear();

        claims.delete(claim.id());
        flushAndClear();

        assertThat(claims.findByDonor(jana)).isEmpty();
        assertThat(claims.findById(claim.id())).isEmpty();
    }

    @ParameterizedTest(name = "symbol {0} answered {1} breaks {2}")
    @CsvSource({
            "6123456789, MAYBE, ck_donor_symbol_claim_answer",
            "0612345678, CONFIRMED, ck_donor_symbol_claim_symbol",
            "0, DECLINED, ck_donor_symbol_claim_symbol"})
    @DisplayName("Given the schema, when a claim with an unknown answer or a symbol not in its matching form is inserted, then a check constraint refuses it")
    void should_refuse_when_inserted_given_unknown_answer_or_symbol_not_in_matching_form(String symbol, String answer, String constraint) {
        DonorReference jana = storedDonor("4821937560");
        entityManager.flush();

        assertThatThrownBy(() -> insertClaim(jana, symbol, answer)).hasMessageContaining(constraint);
    }

    private void insertClaim(DonorReference donor, String symbol, String answer) {
        jdbc.sql("insert into donor_symbol_claim (id, donor_id, account_number, bank_code, variable_symbol, answer, answered_at)"
                        + " values (?, ?, '1234567', '0800', ?, ?, now())")
                .params(UuidV7.generate(NOW), donor.value(), symbol, answer)
                .update();
    }

    private static SymbolClaim claim(DonorReference donor, SenderAccount account, VariableSymbol symbol, SymbolClaimAnswer answer, Instant at) {
        return SymbolClaim.answer(SymbolClaimId.newId(at), donor, account, symbol, answer, at);
    }

    private DonorReference storedDonor(String symbol) {
        DonorRecord record = DonorRecord.registerPerson(new DonorReference(UuidV7.generate(NOW)), "Jana Nováková",
                new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"), new VariableSymbol(symbol), LocaleCode.CS, NOW);
        donorRecords.save(record);
        return record.id();
    }

    private void flushAndClear() {
        entityManager.flush();
        entityManager.clear();
    }
}
