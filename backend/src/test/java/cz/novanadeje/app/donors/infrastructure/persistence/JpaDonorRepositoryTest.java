package cz.novanadeje.app.donors.infrastructure.persistence;

import cz.novanadeje.app.TestcontainersConfiguration;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.EmailVerificationToken;
import cz.novanadeje.app.donors.domain.EmailVerificationTokenRepository;
import cz.novanadeje.app.donors.domain.LinkSecret;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;

import java.time.Duration;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({TestcontainersConfiguration.class, JpaDonorRepository.class, JpaEmailVerificationTokenRepository.class})
class JpaDonorRepositoryTest {

    private static final Instant NOW = Instant.parse("2026-10-18T10:00:00Z");

    @Autowired
    private DonorRepository donors;
    @Autowired
    private EmailVerificationTokenRepository tokens;
    @Autowired
    private EntityManager entityManager;

    @Test
    @DisplayName("Given a saved donor, when the e-mail is verified and saved again, then the verification time survives a reload")
    void should_keep_verification_time_when_saved_given_verified_donor() {
        Donor donor = donor("jana@example.cz", "4821937560");
        donors.save(donor);
        flushAndClear();
        assertThat(donors.findById(donor.id()).orElseThrow().isEmailVerified()).isFalse();

        Donor reloaded = donors.findById(donor.id()).orElseThrow();
        reloaded.verifyEmail(NOW.plusSeconds(90));
        donors.save(reloaded);
        flushAndClear();

        assertThat(donors.findById(donor.id()).orElseThrow().emailVerifiedAt()).contains(NOW.plusSeconds(90));
    }

    @Test
    @DisplayName("Given a donor with a verification link, when the donor is deleted, then the donor and the link are gone and the address is free at once")
    void should_remove_donor_and_links_when_deleted_given_donor_with_link() {
        Donor donor = donor("jana@example.cz", "4821937560");
        donors.save(donor);
        LinkSecret secret = LinkSecret.generate();
        tokens.save(EmailVerificationToken.issue(secret, donor.id(), NOW, Duration.ofHours(24)));
        flushAndClear();

        donors.delete(donor.id());
        donors.save(donor("jana@example.cz", "4821937561"));
        flushAndClear();

        assertThat(donors.findById(donor.id())).isEmpty();
        assertThat(tokens.findBySecretHash(secret.hash())).isEmpty();
        assertThat(donors.findByEmail(new EmailAddress("jana@example.cz")).orElseThrow().variableSymbol()).isEqualTo(new VariableSymbol("4821937561"));
    }

    @Test
    @DisplayName("Given two administrators and a plain donor, when the administrators are listed, then only they come, ordered by name")
    void should_list_administrators_by_name_when_asked_given_mixed_donors() {
        Donor zdena = donor("zdena@example.cz", "4821937570");
        zdena.updateProfile("Zdeňka Znamenáčková", zdena.address(), zdena.preferredLocale());
        zdena.grantAdministration();
        Donor andrea = donor("andrea@example.cz", "4821937571");
        andrea.updateProfile("Andrea Znamenáčková", andrea.address(), andrea.preferredLocale());
        andrea.grantAdministration();
        Donor plain = donor("jana@example.cz", "4821937572");
        donors.save(zdena);
        donors.save(andrea);
        donors.save(plain);
        flushAndClear();

        assertThat(donors.findAdministrators()).extracting(Donor::name).containsExactly("Andrea Znamenáčková", "Zdeňka Znamenáčková");
        assertThat(donors.findAdministrators()).allMatch(Donor::isAdministrator);
    }

    private static Donor donor(String email, String variableSymbol) {
        return Donor.register(DonorId.newId(NOW), DonorType.PERSON, "Jana Nováková", null,
                new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"), new EmailAddress(email), new PasswordHash("$hash"),
                new VariableSymbol(variableSymbol), LocaleCode.CS, NOW);
    }

    private void flushAndClear() {
        entityManager.flush();
        entityManager.clear();
    }
}
