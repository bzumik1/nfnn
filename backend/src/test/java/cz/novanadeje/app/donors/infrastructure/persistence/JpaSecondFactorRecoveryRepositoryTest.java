package cz.novanadeje.app.donors.infrastructure.persistence;

import cz.novanadeje.app.TestcontainersConfiguration;
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
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({TestcontainersConfiguration.class, JpaDonorRepository.class, JpaSecondFactorRecoveryRepository.class})
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
