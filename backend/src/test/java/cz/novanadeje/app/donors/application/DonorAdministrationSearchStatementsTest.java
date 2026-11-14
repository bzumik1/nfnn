package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.IntegrationTest;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.Passkey;
import cz.novanadeje.app.donors.domain.PasskeyRepository;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.Role;
import cz.novanadeje.app.donors.domain.SecondFactor;
import cz.novanadeje.app.donors.domain.SecondFactorRepository;
import cz.novanadeje.app.donors.domain.TotpSecret;
import cz.novanadeje.app.shared.domain.DonorName;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import cz.novanadeje.app.support.DatabaseCleaner;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.time.Instant;
import java.util.List;
import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.assertThat;

@IntegrationTest
class DonorAdministrationSearchStatementsTest {

    private static final Instant NOW = Instant.parse("2026-11-05T10:00:00Z");
    private static final int DONORS = 12;

    @Autowired
    private DonorAdministrationService administration;
    @Autowired
    private DonorRepository donors;
    @Autowired
    private SecondFactorRepository secondFactors;
    @Autowired
    private PasskeyRepository passkeys;
    @Autowired
    private EntityManagerFactory entityManagerFactory;
    @Autowired
    private JdbcClient jdbc;

    private Statistics statistics;

    @BeforeEach
    void twelveDonors() {
        new DatabaseCleaner(jdbc).emptyAllTables();
        for (int index = 0; index < DONORS; index++) {
            Donor donor = Donor.register(DonorId.newId(NOW), DonorType.PERSON, new DonorName("Hledaná dárkyně %02d".formatted(index)), null,
                    new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"), new EmailAddress("hledana-%02d@example.cz".formatted(index)),
                    new PasswordHash("$hash"), new VariableSymbol(Long.toString(6_100_000_000L + index)), LocaleCode.CS, NOW);
            if (index % 3 == 0) {
                donor.verifyEmail(NOW);
                donor.grantAdministration(true);
            }
            donors.save(donor);
            if (index % 2 == 0) {
                secondFactors.save(SecondFactor.reconstitute(donor.id(), TotpSecret.generate(), NOW, NOW, null));
            } else if (index % 5 == 1) {
                secondFactors.save(SecondFactor.enrol(donor.id(), TotpSecret.generate(), NOW));
            }
            for (int passkey = 0; passkey < index % 4; passkey++) {
                passkeys.save(Passkey.register(donor.id(), "credential-%02d-%d".formatted(index, passkey), new byte[]{1, 2, 3}, 0, List.of("internal"),
                        "Telefon", "nfnn.cz", NOW));
            }
        }
        statistics = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        statistics.setStatisticsEnabled(true);
    }

    @AfterEach
    void truncate() {
        statistics.setStatisticsEnabled(false);
        statistics.clear();
        new DatabaseCleaner(jdbc).emptyAllTables();
    }

    @Test
    @DisplayName("Given twelve donors, some administrators, some with a second factor on or still enrolling and some with passkeys, when one or all are searched for, then each view tells its roles, factor and passkeys and twelve take as many statements as one")
    void should_take_as_many_statements_for_twelve_as_for_one_when_searched_given_twelve_donors_with_roles_factors_and_passkeys() {
        long forOne = statementsOf(() -> administration.search("hledana", 0, 1)).statements();
        Counted forTwelve = statementsOf(() -> administration.search("hledana", 0, DONORS));

        assertThat(forTwelve.result().items()).hasSize(DONORS);
        assertThat(forTwelve.result().items()).allSatisfy(view -> {
            int index = Integer.parseInt(view.donor().name().value().substring(view.donor().name().value().length() - 2));
            assertThat(view.donor().roles().contains(Role.ADMIN)).as("administrator %d", index).isEqualTo(index % 3 == 0);
            assertThat(view.secondFactorEnabled()).as("second factor of %d", index).isEqualTo(index % 2 == 0);
            assertThat(view.passkeys()).as("passkeys of %d", index).isEqualTo(index % 4);
        });
        assertThat(forTwelve.statements()).as("statements for twelve donors").isEqualTo(forOne);
    }

    private Counted statementsOf(Supplier<DonorSearchResult> search) {
        statistics.clear();
        DonorSearchResult result = search.get();
        return new Counted(result, statistics.getPrepareStatementCount());
    }

    private record Counted(DonorSearchResult result, long statements) {
    }
}
