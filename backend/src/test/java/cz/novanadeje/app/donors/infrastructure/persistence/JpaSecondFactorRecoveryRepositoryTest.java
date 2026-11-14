package cz.novanadeje.app.donors.infrastructure.persistence;

import cz.novanadeje.app.PersistenceTest;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.SecondFactorRecovery;
import cz.novanadeje.app.donors.domain.SecondFactorRecoveryRepository;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.SecondFactorRecoveryCode;
import cz.novanadeje.app.shared.domain.UuidV7;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

@PersistenceTest
class JpaSecondFactorRecoveryRepositoryTest {

    private static final Instant NOW = Instant.parse("2026-10-24T10:00:00Z");
    private static final Duration TTL = Duration.ofDays(14);
    private static final SecondFactorRecoveryCode FIRST = new SecondFactorRecoveryCode("ABCD2345");
    private static final SecondFactorRecoveryCode SECOND = new SecondFactorRecoveryCode("WXYZ6789");

    @Autowired
    private SecondFactorRecoveryRepository recoveries;
    @Autowired
    private DonorRepository donors;
    @Autowired
    private EntityManager entityManager;
    @Autowired
    private JdbcClient jdbc;

    private DonorId jana;
    private DonorId petr;

    @BeforeEach
    void setUp() {
        jana = donor("jana@example.cz", "4821937560");
        petr = donor("petr@example.cz", "4821937561");
        flushAndClear();
    }

    @Test
    @DisplayName("Given a saved recovery, when it is found by the hash of its code, then every field survives")
    void should_keep_fields_when_found_by_code_hash_given_saved_recovery() {
        SecondFactorRecovery recovery = SecondFactorRecovery.open(jana, FIRST, NOW, TTL);
        recoveries.replaceOpenOf(jana, recovery);
        flushAndClear();

        SecondFactorRecovery found = recoveries.findByCodeHash(FIRST.hash()).orElseThrow();

        assertThat(found.id()).isEqualTo(recovery.id());
        assertThat(found.donorId()).isEqualTo(jana);
        assertThat(found.createdAt()).isEqualTo(NOW);
        assertThat(found.expiresAt()).isEqualTo(NOW.plus(TTL));
        assertThat(found.usedAt()).isEmpty();
        assertThat(found.code()).contains(FIRST);
        assertThat(recoveries.findByCodeHash(SECOND.hash())).isEmpty();
    }

    @Test
    @DisplayName("Given a used, an expired and an open recovery of a donor and an open one of another donor, when the donor's open recovery is looked up, then only the open one comes back with its code")
    void should_find_only_the_donors_open_recovery_when_looked_up() {
        SecondFactorRecovery used = SecondFactorRecovery.open(jana, new SecondFactorRecoveryCode("QRST2345"), NOW.minus(TTL), TTL.multipliedBy(2));
        recoveries.replaceOpenOf(jana, used);
        recoveries.markUsed(used.id(), NOW.minusSeconds(10));
        jdbc.sql("insert into donor_second_factor_recovery (id, donor_id, code_hash, code, created_at, expires_at) values (?, ?, ?, ?, ?, ?)")
                .params(UuidV7.generate(NOW.minus(TTL)), jana.value(), new SecondFactorRecoveryCode("MNPQ2345").hash(), "MNPQ2345",
                        Timestamp.from(NOW.minus(TTL)), Timestamp.from(NOW))
                .update();
        SecondFactorRecovery open = SecondFactorRecovery.open(jana, FIRST, NOW.minusSeconds(60), TTL);
        recoveries.replaceOpenOf(jana, open);
        recoveries.replaceOpenOf(petr, SecondFactorRecovery.open(petr, SECOND, NOW, TTL));
        flushAndClear();

        SecondFactorRecovery found = recoveries.findOpenOf(jana, NOW).orElseThrow();

        assertThat(found.id()).isEqualTo(open.id());
        assertThat(found.code()).contains(FIRST);
        assertThat(recoveries.findOpenOf(jana, NOW.plus(TTL))).isEmpty();
    }

    @Test
    @DisplayName("Given an open recovery stored before codes were kept, when it is looked up, then it comes back without a code")
    void should_return_no_code_when_looked_up_given_a_recovery_stored_without_one() {
        jdbc.sql("insert into donor_second_factor_recovery (id, donor_id, code_hash, created_at, expires_at) values (?, ?, ?, ?, ?)")
                .params(UuidV7.generate(NOW), jana.value(), FIRST.hash(), Timestamp.from(NOW), Timestamp.from(NOW.plus(TTL)))
                .update();

        assertThat(recoveries.findOpenOf(jana, NOW.plusSeconds(1)).orElseThrow().code()).isEmpty();
    }

    @Test
    @DisplayName("Given an open and a used recovery of a donor and one of another donor, when the donor opens a new one, then only the donor's open one is replaced")
    void should_replace_only_the_donors_open_recovery_when_a_new_one_is_opened() {
        SecondFactorRecovery used = SecondFactorRecovery.open(jana, new SecondFactorRecoveryCode("QRST2345"), NOW, TTL);
        recoveries.replaceOpenOf(jana, used);
        recoveries.markUsed(used.id(), NOW.plusSeconds(10));
        recoveries.replaceOpenOf(jana, SecondFactorRecovery.open(jana, FIRST, NOW.plusSeconds(20), TTL));
        recoveries.replaceOpenOf(petr, SecondFactorRecovery.open(petr, new SecondFactorRecoveryCode("MNPQ2345"), NOW, TTL));
        flushAndClear();

        recoveries.replaceOpenOf(jana, SecondFactorRecovery.open(jana, SECOND, NOW.plusSeconds(30), TTL));
        flushAndClear();

        assertThat(recoveries.findByCodeHash(FIRST.hash())).isEmpty();
        assertThat(recoveries.findByCodeHash(SECOND.hash())).isPresent();
        assertThat(recoveries.findByCodeHash(new SecondFactorRecoveryCode("QRST2345").hash())).isPresent();
        assertThat(recoveries.findByCodeHash(new SecondFactorRecoveryCode("MNPQ2345").hash())).isPresent();
    }

    @Test
    @DisplayName("Given a recovery, when it is marked used twice, then only the first use counts and its time stays")
    void should_count_only_the_first_use_when_marked_used_twice() {
        SecondFactorRecovery recovery = SecondFactorRecovery.open(jana, FIRST, NOW, TTL);
        recoveries.replaceOpenOf(jana, recovery);
        flushAndClear();

        assertThat(recoveries.markUsed(recovery.id(), NOW.plusSeconds(10))).isTrue();
        assertThat(recoveries.markUsed(recovery.id(), NOW.plusSeconds(20))).isFalse();

        assertThat(recoveries.findByCodeHash(FIRST.hash()).orElseThrow().usedAt()).contains(NOW.plusSeconds(10));
    }

    @Test
    @DisplayName("Given an open recovery, when it is marked used, then its readable code is forgotten and its hash still finds it")
    void should_forget_the_code_when_marked_used_given_open_recovery() {
        SecondFactorRecovery recovery = SecondFactorRecovery.open(jana, FIRST, NOW, TTL);
        recoveries.replaceOpenOf(jana, recovery);
        flushAndClear();

        recoveries.markUsed(recovery.id(), NOW.plusSeconds(10));

        assertThat(recoveries.findByCodeHash(FIRST.hash()).orElseThrow().code()).isEmpty();
        assertThat(jdbc.sql("select count(*) from donor_second_factor_recovery where code is not null").query(Long.class).single()).isZero();
    }

    @Test
    @DisplayName("Given a used recovery that still holds its code, an expired one and an open one, when the codes of closed recoveries are forgotten, then only the open one keeps its code")
    void should_keep_only_the_open_code_when_closed_codes_forgotten() {
        insert(jana, new SecondFactorRecoveryCode("QRST2345"), NOW.minus(TTL), NOW.plusSeconds(60), NOW.minusSeconds(60));
        insert(jana, new SecondFactorRecoveryCode("MNPQ2345"), NOW.minus(TTL), NOW, null);
        recoveries.replaceOpenOf(petr, SecondFactorRecovery.open(petr, SECOND, NOW.minusSeconds(60), TTL));
        flushAndClear();

        int forgotten = recoveries.forgetCodesClosedAt(NOW);

        assertThat(forgotten).isEqualTo(2);
        assertThat(recoveries.findByCodeHash(new SecondFactorRecoveryCode("QRST2345").hash()).orElseThrow().code()).isEmpty();
        assertThat(recoveries.findByCodeHash(new SecondFactorRecoveryCode("MNPQ2345").hash()).orElseThrow().code()).isEmpty();
        assertThat(recoveries.findOpenOf(petr, NOW).orElseThrow().code()).contains(SECOND);
    }

    @Test
    @DisplayName("Given a used and an unused recovery that expired before the cutoff and one that expires after it, when those expired before the cutoff are deleted, then only the later one stays")
    void should_delete_only_recoveries_expired_before_cutoff_when_deleted() {
        Instant cutoff = NOW.minus(Duration.ofDays(30));
        insert(jana, new SecondFactorRecoveryCode("QRST2345"), cutoff.minus(TTL), cutoff.minusSeconds(1), cutoff.minus(TTL).plusSeconds(60));
        insert(jana, new SecondFactorRecoveryCode("MNPQ2345"), cutoff.minus(TTL), cutoff.minusSeconds(1), null);
        insert(jana, FIRST, cutoff.minus(TTL), cutoff, null);
        flushAndClear();

        int deleted = recoveries.deleteExpiredBefore(cutoff);

        assertThat(deleted).isEqualTo(2);
        assertThat(recoveries.findByCodeHash(new SecondFactorRecoveryCode("QRST2345").hash())).isEmpty();
        assertThat(recoveries.findByCodeHash(new SecondFactorRecoveryCode("MNPQ2345").hash())).isEmpty();
        assertThat(recoveries.findByCodeHash(FIRST.hash())).isPresent();
    }

    @Test
    @DisplayName("Given an open and a used recovery of a donor and one of another donor, when the donor's are deleted, then only the other donor's stays")
    void should_delete_only_the_donors_recoveries_when_deleted_given_two_donors() {
        SecondFactorRecovery used = SecondFactorRecovery.open(jana, new SecondFactorRecoveryCode("QRST2345"), NOW, TTL);
        recoveries.replaceOpenOf(jana, used);
        recoveries.markUsed(used.id(), NOW.plusSeconds(10));
        recoveries.replaceOpenOf(jana, SecondFactorRecovery.open(jana, FIRST, NOW.plusSeconds(20), TTL));
        recoveries.replaceOpenOf(petr, SecondFactorRecovery.open(petr, SECOND, NOW, TTL));
        flushAndClear();

        recoveries.deleteAllOfWithoutWaiting(jana);

        assertThat(recoveries.findByCodeHash(new SecondFactorRecoveryCode("QRST2345").hash())).isEmpty();
        assertThat(recoveries.findByCodeHash(FIRST.hash())).isEmpty();
        assertThat(recoveries.findByCodeHash(SECOND.hash())).isPresent();
    }

    private void insert(DonorId donor, SecondFactorRecoveryCode code, Instant createdAt, Instant expiresAt, Instant usedAt) {
        jdbc.sql("insert into donor_second_factor_recovery (id, donor_id, code_hash, code, created_at, expires_at, used_at) values (?, ?, ?, ?, ?, ?, ?)")
                .params(UuidV7.generate(createdAt), donor.value(), code.hash(), code.value(), Timestamp.from(createdAt), Timestamp.from(expiresAt),
                        usedAt == null ? null : Timestamp.from(usedAt))
                .update();
    }

    private DonorId donor(String email, String variableSymbol) {
        Donor donor = Donor.register(DonorId.newId(NOW), DonorType.PERSON, "Jana Nováková", null,
                new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"), new EmailAddress(email), new PasswordHash("$hash"),
                new VariableSymbol(variableSymbol), LocaleCode.CS, NOW);
        donors.save(donor);
        return donor.id();
    }

    private void flushAndClear() {
        entityManager.flush();
        entityManager.clear();
    }
}
