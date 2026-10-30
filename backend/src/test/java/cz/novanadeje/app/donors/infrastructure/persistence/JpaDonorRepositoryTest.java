package cz.novanadeje.app.donors.infrastructure.persistence;

import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.EmailVerificationToken;
import cz.novanadeje.app.donors.domain.EmailVerificationTokenRepository;
import cz.novanadeje.app.donors.domain.LinkSecret;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.ErasedPersonalData;
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
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(DonorsPersistenceTestConfiguration.class)
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
    @DisplayName("Given a donor who never signed in, when the sign-ins are recorded one after another, then the previous one is always the sign-in before the last")
    void should_keep_the_sign_in_before_the_last_when_recorded_given_several_sign_ins() {
        Donor donor = donor("jana@example.cz", "4821937560");
        donors.save(donor);
        flushAndClear();
        assertThat(donors.findPreviousSignIn(donor.id())).isEmpty();

        donors.recordSignIn(donor.id(), NOW);
        flushAndClear();
        assertThat(donors.findPreviousSignIn(donor.id())).isEmpty();

        donors.recordSignIn(donor.id(), NOW.plusSeconds(3600));
        donors.recordSignIn(donor.id(), NOW.plusSeconds(7200));
        flushAndClear();

        assertThat(donors.findPreviousSignIn(donor.id())).contains(NOW.plusSeconds(3600));
    }

    @Test
    @DisplayName("Given a donor with recorded sign-ins, when the donor is changed and saved, then the sign-ins stay, and when they are forgotten, then none is left")
    void should_keep_sign_ins_when_saved_and_drop_them_when_forgotten_given_recorded_sign_ins() {
        Donor donor = donor("jana@example.cz", "4821937560");
        donors.save(donor);
        donors.recordSignIn(donor.id(), NOW);
        donors.recordSignIn(donor.id(), NOW.plusSeconds(60));
        flushAndClear();

        Donor reloaded = donors.findById(donor.id()).orElseThrow();
        reloaded.verifyEmail(NOW.plusSeconds(90));
        donors.save(reloaded);
        flushAndClear();
        assertThat(donors.findPreviousSignIn(donor.id())).contains(NOW);

        donors.forgetSignIns(donor.id());
        donors.recordSignIn(donor.id(), NOW.plusSeconds(120));
        flushAndClear();

        assertThat(donors.findPreviousSignIn(donor.id())).isEmpty();
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
        zdena.updateProfile("Zdeňka Horáčková", zdena.address(), zdena.preferredLocale());
        zdena.verifyEmail(NOW);
        zdena.grantAdministration();
        Donor andrea = donor("andrea@example.cz", "4821937571");
        andrea.updateProfile("Andrea Horáčková", andrea.address(), andrea.preferredLocale());
        andrea.verifyEmail(NOW);
        andrea.grantAdministration();
        Donor plain = donor("jana@example.cz", "4821937572");
        donors.save(zdena);
        donors.save(andrea);
        donors.save(plain);
        flushAndClear();

        assertThat(donors.findAdministrators()).extracting(Donor::name).containsExactly("Andrea Horáčková", "Zdeňka Horáčková");
        assertThat(donors.findAdministrators()).allMatch(Donor::isAdministrator);
    }

    @Test
    @DisplayName("Given saved donors, when some ids and an unknown id are looked up, then only the saved ones come")
    void should_find_saved_donors_when_looked_up_by_ids_given_unknown_id_among_them() {
        Donor jana = donor("jana@example.cz", "4821937580");
        Donor petr = donor("petr@example.cz", "4821937581");
        donors.save(jana);
        donors.save(petr);
        donors.save(donor("eva@example.cz", "4821937582"));
        flushAndClear();

        assertThat(donors.findByIds(List.of(jana.id(), petr.id(), DonorId.newId(NOW)))).extracting(Donor::id).containsExactlyInAnyOrder(jana.id(), petr.id());
        assertThat(donors.findByIds(List.of())).isEmpty();
    }

    @Test
    @DisplayName("Given saved donors, when searched by a part of the name or e-mail or the start of the symbol, then the matches come by name from the offset, at most the limit, like-wildcards are literal and an empty query lists everyone")
    void should_find_by_name_email_or_symbol_start_when_searched_given_saved_donors() {
        Donor jana = donor("jana@example.cz", "4821937560");
        Donor petr = donor("petr@firma.cz", "7310945528");
        petr.updateProfile("Petr Novák", petr.address(), petr.preferredLocale());
        Donor eva = donor("eva@example.cz", "4899999999");
        eva.updateProfile("Eva Dvořáková", eva.address(), eva.preferredLocale());
        Donor karel = donor("karel@example.cz", "1000000000");
        karel.updateProfile("Karel 100% Veselý", karel.address(), karel.preferredLocale());
        donors.save(jana);
        donors.save(petr);
        donors.save(eva);
        donors.save(karel);
        flushAndClear();

        assertThat(donors.search("novák", 0, 20)).extracting(Donor::name).containsExactly("Jana Nováková", "Petr Novák");
        assertThat(donors.search("FIRMA.CZ", 0, 20)).extracting(Donor::name).containsExactly("Petr Novák");
        assertThat(donors.search("example", 0, 20)).extracting(Donor::name).containsExactly("Eva Dvořáková", "Jana Nováková", "Karel 100% Veselý");
        assertThat(donors.search("48", 0, 20)).extracting(Donor::name).containsExactly("Eva Dvořáková", "Jana Nováková");
        assertThat(donors.search("48", 0, 1)).extracting(Donor::name).containsExactly("Eva Dvořáková");
        assertThat(donors.search("100%", 0, 20)).extracting(Donor::name).containsExactly("Karel 100% Veselý");
        assertThat(donors.search("_", 0, 20)).isEmpty();
        assertThat(donors.search("xyz", 0, 20)).isEmpty();
        assertThat(donors.search("", 0, 20)).extracting(Donor::name).containsExactly("Eva Dvořáková", "Jana Nováková", "Karel 100% Veselý", "Petr Novák");
        assertThat(donors.search("", 1, 2)).extracting(Donor::name).containsExactly("Jana Nováková", "Karel 100% Veselý");
        assertThat(donors.search("", 3, 20)).extracting(Donor::name).containsExactly("Petr Novák");
    }

    @Test
    @DisplayName("Given donors with Czech letters, when searched with or without the accents and in any case, then the same donors match by name and by e-mail")
    void should_ignore_accents_and_case_when_searched_given_czech_names() {
        Donor jana = donor("jana@example.cz", "4821937560");
        Donor stepan = donor("stepan@example.cz", "1000000000");
        stepan.updateProfile("ŠTĚPÁN ŘÍHA", stepan.address(), stepan.preferredLocale());
        donors.save(jana);
        donors.save(stepan);
        flushAndClear();

        assertThat(donors.search("novakova", 0, 20)).extracting(Donor::name).containsExactly("Jana Nováková");
        assertThat(donors.search("NOVÁKOVÁ", 0, 20)).extracting(Donor::name).containsExactly("Jana Nováková");
        assertThat(donors.search("stepan riha", 0, 20)).extracting(Donor::name).containsExactly("ŠTĚPÁN ŘÍHA");
        assertThat(donors.search("štěpán@", 0, 20)).extracting(Donor::name).containsExactly("ŠTĚPÁN ŘÍHA");
    }

    @Test
    @DisplayName("Given a saved donor, when erased and saved again, then the placeholders, the empty roles and the time survive a reload, the former address is free and the search finds the donor by symbol, not by the former name")
    void should_keep_erasure_when_saved_given_erased_donor() {
        Donor donor = donor("jana@example.cz", "4821937560");
        donors.save(donor);
        flushAndClear();

        Donor stored = donors.findById(donor.id()).orElseThrow();
        stored.erase(NOW.plusSeconds(90));
        donors.save(stored);
        flushAndClear();
        donors.save(donor("jana@example.cz", "4821937561"));
        flushAndClear();

        Donor reloaded = donors.findById(donor.id()).orElseThrow();
        assertThat(reloaded.isErased()).isTrue();
        assertThat(reloaded.erasedAt()).contains(NOW.plusSeconds(90));
        assertThat(reloaded.name()).isEqualTo(ErasedPersonalData.NAME);
        assertThat(reloaded.email()).isEqualTo(ErasedPersonalData.emailFor(donor.id().value()));
        assertThat(reloaded.roles()).isEmpty();
        assertThat(reloaded.isEmailVerified()).isFalse();
        assertThat(donors.findByEmail(new EmailAddress("jana@example.cz")).orElseThrow().variableSymbol()).isEqualTo(new VariableSymbol("4821937561"));
        assertThat(donors.search("4821937560", 0, 20)).extracting(Donor::id).containsExactly(donor.id());
        assertThat(donors.search("nováková", 0, 20)).extracting(Donor::id).doesNotContain(donor.id());
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
