package cz.novanadeje.app.donors.infrastructure.persistence;

import cz.novanadeje.app.TestcontainersConfiguration;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.Passkey;
import cz.novanadeje.app.donors.domain.PasskeyRepository;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({TestcontainersConfiguration.class, JpaDonorRepository.class, JpaPasskeyRepository.class})
class JpaPasskeyRepositoryTest {

    private static final Instant NOW = Instant.parse("2026-10-23T10:00:00Z");

    @Autowired
    private PasskeyRepository passkeys;
    @Autowired
    private DonorRepository donors;
    @Autowired
    private EntityManager entityManager;

    private DonorId jana;
    private DonorId petr;

    @BeforeEach
    void setUp() {
        jana = donor("jana@example.cz", "4821937560");
        petr = donor("petr@example.cz", "7310945528");
        flushAndClear();
    }

    @Test
    @DisplayName("Given passkeys of two donors, when every passkey of one is deleted, then only that donor's go and the count says how many")
    void should_delete_only_that_donors_passkeys_when_all_of_one_donor_are_deleted_given_passkeys_of_two_donors() {
        passkeys.save(passkey(jana, "jana-phone", NOW));
        passkeys.save(passkey(jana, "jana-laptop", NOW.plusSeconds(1)));
        Passkey petrs = passkey(petr, "petr-phone", NOW);
        passkeys.save(petrs);
        flushAndClear();

        int deleted = passkeys.deleteAllOf(jana);
        flushAndClear();

        assertThat(deleted).isEqualTo(2);
        assertThat(passkeys.findByDonor(jana)).isEmpty();
        assertThat(passkeys.findByDonor(petr)).extracting(Passkey::id).containsExactly(petrs.id());
    }

    @Test
    @DisplayName("Given passkeys of the staging host, of the site and written without a host, when the keys of other sites are removed, then the unmarked ones count as the site's and only the staging keys go")
    void should_delete_only_keys_of_other_sites_when_removed_given_unmarked_keys_count_as_site() {
        Passkey staging = Passkey.register(jana, "jana-staging", new byte[]{1, 2, 3}, 0, List.of("internal"), "Telefon", "nfnn.znamenacek.duckdns.org", NOW);
        Passkey site = passkey(petr, "petr-site", NOW);
        Passkey unmarked = Passkey.register(jana, "jana-unmarked", new byte[]{1, 2, 3}, 0, List.of("internal"), "Mac", "nfnn.cz", NOW.plusSeconds(1));
        passkeys.save(staging);
        passkeys.save(site);
        passkeys.save(unmarked);
        flushAndClear();
        entityManager.createNativeQuery("update donor_passkey set relying_party_id = null where credential_id = 'jana-unmarked'").executeUpdate();
        flushAndClear();

        int adopted = passkeys.adoptUnmarked("nfnn.cz");
        List<DonorId> affected = passkeys.deleteOfOtherSites("nfnn.cz");
        flushAndClear();

        assertThat(adopted).isEqualTo(1);
        assertThat(affected).containsExactly(jana);
        assertThat(passkeys.findById(staging.id())).isEmpty();
        assertThat(passkeys.findById(site.id())).isPresent();
        assertThat(passkeys.findById(unmarked.id())).get().extracting(found -> found.relyingPartyId().orElseThrow()).isEqualTo("nfnn.cz");
    }

    private static Passkey passkey(DonorId donor, String credentialId, Instant at) {
        return Passkey.register(donor, credentialId, new byte[]{1, 2, 3}, 0, List.of("internal"), "Telefon", "nfnn.cz", at);
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
