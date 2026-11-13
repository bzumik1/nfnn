package cz.novanadeje.app.donors.infrastructure.persistence;

import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.EmailVerificationToken;
import cz.novanadeje.app.donors.domain.EmailVerificationTokenRepository;
import cz.novanadeje.app.donors.domain.LinkSecret;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.RegistrationReminders;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.ErasedPersonalData;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import cz.novanadeje.app.shared.infrastructure.lock.AdvisoryLock;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.IllegalTransactionStateException;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Duration;
import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

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
    private RegistrationReminders reminders;
    @Autowired
    private EntityManager entityManager;
    @Autowired
    private DataSource dataSource;

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
    @DisplayName("Given unconfirmed registrations made a second before, at and a second after the cutoff, when the unconfirmed ones before the cutoff are deleted, then only the one before it goes and its address and symbol are free")
    void should_delete_only_registration_before_cutoff_when_unconfirmed_deleted_given_registrations_around_cutoff() {
        Instant cutoff = NOW.minus(Duration.ofDays(30));
        Donor before = registeredAt("pred@example.cz", "4821937570", cutoff.minusSeconds(1));
        Donor at = registeredAt("presne@example.cz", "4821937571", cutoff);
        Donor after = registeredAt("po@example.cz", "4821937572", cutoff.plusSeconds(1));
        flushAndClear();

        int deleted = donors.deleteUnconfirmedRegisteredBefore(cutoff);
        flushAndClear();

        assertThat(deleted).isEqualTo(1);
        assertThat(donors.findById(before.id())).isEmpty();
        assertThat(donors.findById(at.id())).isPresent();
        assertThat(donors.findById(after.id())).isPresent();
        assertThat(donors.existsByEmail(new EmailAddress("pred@example.cz"))).isFalse();
        assertThat(donors.existsByVariableSymbol(new VariableSymbol("4821937570"))).isFalse();
    }

    @Test
    @DisplayName("Given a confirmed and an erased account registered long before the cutoff, when the unconfirmed ones before the cutoff are deleted, then both stay")
    void should_keep_confirmed_and_erased_accounts_when_unconfirmed_deleted_given_both_old() {
        Instant longAgo = NOW.minus(Duration.ofDays(400));
        Donor confirmed = registeredAt("jana@example.cz", "4821937573", longAgo);
        confirmed.verifyEmail(longAgo.plusSeconds(60));
        donors.save(confirmed);
        Donor erased = registeredAt("petr@example.cz", "4821937574", longAgo);
        erased.verifyEmail(longAgo.plusSeconds(60));
        erased.erase(longAgo.plus(Duration.ofDays(1)));
        donors.save(erased);
        flushAndClear();

        int deleted = donors.deleteUnconfirmedRegisteredBefore(NOW.minus(Duration.ofDays(30)));
        flushAndClear();

        assertThat(deleted).isZero();
        assertThat(donors.findById(confirmed.id())).isPresent();
        assertThat(donors.findById(erased.id())).isPresent();
    }

    @Test
    @DisplayName("Given an old unconfirmed registration with its verification link and reminder, when it is deleted, then every table that refers to the donor cascades and holds no row of it")
    void should_leave_no_row_of_donor_in_any_child_table_when_unconfirmed_deleted_given_link_and_reminder() {
        Donor donor = registeredAt("jana@example.cz", "4821937575", NOW.minus(Duration.ofDays(40)));
        tokens.save(EmailVerificationToken.issue(LinkSecret.generate(), donor.id(), NOW.minus(Duration.ofDays(40)), Duration.ofHours(24)));
        reminders.recordSent(donor.id(), NOW.minus(Duration.ofDays(39)));
        flushAndClear();
        List<Object[]> childTables = childTablesOfDonor();
        assertThat(childTables).isNotEmpty().allSatisfy(child -> assertThat(child[2]).as("on delete of %s", child[0]).isEqualTo("c"));
        assertThat(rowsOf(donor, childTables)).isPositive();

        donors.deleteUnconfirmedRegisteredBefore(NOW.minus(Duration.ofDays(30)));
        flushAndClear();

        assertThat(rowsOf(donor, childTables)).isZero();
    }

    @Test
    @DisplayName("Given a verified administrator and another donor, when the administrator is read for an update by id and by e-mail, then the whole donor comes with the role, and an unknown id or address finds nothing")
    void should_find_whole_donor_when_read_for_update_given_saved_administrator() {
        Donor jana = donor("jana@example.cz", "4821937580");
        jana.verifyEmail(NOW);
        jana.grantAdministration(true);
        donors.save(jana);
        donors.save(donor("petr@example.cz", "4821937581"));
        flushAndClear();

        Donor byId = donors.findByIdForUpdate(jana.id()).orElseThrow();
        assertThat(byId.email()).isEqualTo(new EmailAddress("jana@example.cz"));
        assertThat(byId.isAdministrator()).isTrue();
        assertThat(byId.emailVerifiedAt()).contains(NOW);
        flushAndClear();
        assertThat(donors.findByEmailForUpdate(new EmailAddress("jana@example.cz"))).map(Donor::id).contains(jana.id());
        assertThat(donors.findByIdForUpdate(DonorId.newId(NOW))).isEmpty();
        assertThat(donors.findByEmailForUpdate(new EmailAddress("nobody@example.cz"))).isEmpty();
    }

    @Test
    @DisplayName("Given two administrators and a plain donor, when the administrators are listed, then only they come, ordered by name")
    void should_list_administrators_by_name_when_asked_given_mixed_donors() {
        Donor zdena = donor("zdena@example.cz", "4821937570");
        zdena.updateProfile("Zdeňka Horáčková", zdena.address(), zdena.preferredLocale());
        zdena.verifyEmail(NOW);
        zdena.grantAdministration(true);
        Donor andrea = donor("andrea@example.cz", "4821937571");
        andrea.updateProfile("Andrea Horáčková", andrea.address(), andrea.preferredLocale());
        andrea.verifyEmail(NOW);
        andrea.grantAdministration(true);
        Donor plain = donor("jana@example.cz", "4821937572");
        donors.save(zdena);
        donors.save(andrea);
        donors.save(plain);
        flushAndClear();

        assertThat(donors.findAdministrators()).extracting(Donor::name).containsExactly("Andrea Horáčková", "Zdeňka Horáčková");
        assertThat(donors.findAdministrators()).allMatch(Donor::isAdministrator);
    }

    @Test
    @DisplayName("Given an administrator and two plain donors, when every donor is listed, then each comes once by id, the administrator with the role")
    void should_list_every_donor_once_by_id_when_all_listed_given_administrator_among_them() {
        Donor admin = donor("andrea@example.cz", "4821937590");
        admin.verifyEmail(NOW);
        admin.grantAdministration(true);
        Donor jana = donor("jana@example.cz", "4821937591");
        Donor petr = donor("petr@example.cz", "4821937592");
        donors.save(jana);
        donors.save(admin);
        donors.save(petr);
        flushAndClear();

        List<Donor> all = donors.findAll();

        assertThat(all).extracting(donor -> donor.id().value())
                .containsExactlyElementsOf(java.util.stream.Stream.of(admin, jana, petr).map(donor -> donor.id().value()).sorted().toList());
        assertThat(all).filteredOn(Donor::isAdministrator).extracting(Donor::id).containsExactly(admin.id());
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
    @DisplayName("Given donors and administrators with Czech names, when searched and the administrators listed, then they come in Czech alphabetical order, ch after h and lower case beside upper case")
    void should_list_in_czech_order_when_searched_or_administrators_listed_given_czech_names() {
        List<String> czechOrder = List.of("ambrož", "Cibulka", "Čermák", "Dvořák", "Hrubý", "Chalupa", "Novák", "Řezníček", "Říha",
                "Svoboda", "Šťastný", "Zelený", "Žák");
        List<String> stored = List.of("Chalupa", "Cibulka", "Dvořák", "Hrubý", "Novák", "Svoboda", "Zelený", "ambrož", "Čermák",
                "Řezníček", "Říha", "Šťastný", "Žák");
        for (int index = 0; index < stored.size(); index++) {
            Donor donor = donor("darce" + index + "@example.cz", Long.toString(4_800_000_000L + index));
            donor.updateProfile(stored.get(index), donor.address(), donor.preferredLocale());
            donor.verifyEmail(NOW);
            donor.grantAdministration(true);
            donors.save(donor);
        }
        flushAndClear();

        assertThat(donors.search("48", 0, 20)).extracting(Donor::name).containsExactlyElementsOf(czechOrder);
        assertThat(donors.search("48", 5, 3)).extracting(Donor::name).containsExactlyElementsOf(czechOrder.subList(5, 8));
        assertThat(donors.findAdministrators()).extracting(Donor::name).containsExactlyElementsOf(czechOrder);
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

    @Test
    @DisplayName("Given an address locked in a transaction, when another connection tries the same address and another one, then the same address is held until the transaction ends and the other is free")
    void should_hold_address_until_transaction_ends_when_locked_given_open_transaction() throws SQLException {
        donors.lockEmail(new EmailAddress("Jana@Example.cz"));

        try (Connection other = dataSource.getConnection()) {
            assertThat(triesAddressLock(other, "jana@example.cz")).isFalse();
            assertThat(triesAddressLock(other, "petr@example.cz")).isTrue();
        }
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    @DisplayName("Given no transaction, when an address is locked, then it is refused, because the lock would end with the statement")
    void should_refuse_when_locked_given_no_transaction() {
        assertThatThrownBy(() -> donors.lockEmail(new EmailAddress("jana@example.cz"))).isInstanceOf(IllegalTransactionStateException.class);
    }

    private static boolean triesAddressLock(Connection connection, String email) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("select pg_try_advisory_xact_lock(?, ?)")) {
            statement.setInt(1, Math.toIntExact(AdvisoryLock.DONOR_EMAIL_ADDRESSES.key()));
            statement.setInt(2, email.hashCode());
            try (ResultSet result = statement.executeQuery()) {
                result.next();
                return result.getBoolean(1);
            }
        }
    }

    private Donor registeredAt(String email, String variableSymbol, Instant registeredAt) {
        Donor donor = Donor.register(DonorId.newId(registeredAt), DonorType.PERSON, "Jana Nováková", null,
                new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"), new EmailAddress(email), new PasswordHash("$hash"),
                new VariableSymbol(variableSymbol), LocaleCode.CS, registeredAt);
        donors.save(donor);
        return donor;
    }

    @SuppressWarnings("unchecked")
    private List<Object[]> childTablesOfDonor() {
        return entityManager.createNativeQuery("select c.conrelid::regclass::text, a.attname::text, c.confdeltype::text from pg_constraint c"
                + " join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]"
                + " where c.contype = 'f' and c.confrelid = 'donor'::regclass order by 1").getResultList();
    }

    private long rowsOf(Donor donor, List<Object[]> childTables) {
        long rows = 0;
        for (Object[] child : childTables) {
            rows += ((Number) entityManager.createNativeQuery("select count(*) from " + child[0] + " where " + child[1] + " = :donorId")
                    .setParameter("donorId", donor.id().value()).getSingleResult()).longValue();
        }
        return rows;
    }

    @Test
    @DisplayName("Given an erased donor, a donor a restore marked erased with personal data left and an active donor, when the erased donors are listed, then both erased ones come by id with their state and the active one does not")
    void should_list_only_erased_donors_when_erased_listed_given_erased_marked_and_active_donors() {
        Donor erased = donor("erased@example.cz", "4821937601");
        erased.erase(NOW);
        Donor marked = Donor.reconstitute(DonorId.newId(NOW), DonorType.PERSON, "Eva Dvořáková", null, new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"),
                new EmailAddress("eva@example.cz"), null, new VariableSymbol("4821937602"), LocaleCode.CS, java.util.Set.of(), NOW, NOW, NOW.plusSeconds(60));
        Donor active = donor("active@example.cz", "4821937603");
        donors.save(erased);
        donors.save(marked);
        donors.save(active);
        flushAndClear();

        List<Donor> found = donors.findErased();

        assertThat(found).extracting(Donor::id).containsExactlyElementsOf(java.util.stream.Stream.of(erased, marked).map(Donor::id)
                .sorted(java.util.Comparator.comparing(DonorId::value)).toList());
        assertThat(found).filteredOn(Donor::erasureIncomplete).extracting(Donor::id).containsExactly(marked.id());
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
