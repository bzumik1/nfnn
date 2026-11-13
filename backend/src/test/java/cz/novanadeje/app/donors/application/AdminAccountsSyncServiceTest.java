package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.PasskeyRepository;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.SecondFactorRepository;
import cz.novanadeje.app.shared.application.audit.AdminActionEntry;
import cz.novanadeje.app.shared.application.audit.AdminActionTrail;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdminAccountsSyncServiceTest {

    private static final Instant NOW = Instant.parse("2026-11-05T10:00:00Z");

    @Mock
    private DonorRepository donors;
    @Mock
    private SecondFactorRepository secondFactors;
    @Mock
    private PasskeyRepository passkeys;
    @Mock
    private AdminActionTrail trail;

    private AdminAccountsSyncService service;

    @BeforeEach
    void setUp() {
        service = new AdminAccountsSyncService(donors, secondFactors, passkeys, trail);
    }

    @Test
    @DisplayName("Given an account whose administration was revoked, when its accounts snapshot is taken, then it holds no rows and nothing else is read")
    void should_hold_no_rows_when_snapshot_taken_given_revoked_administration() {
        Donor former = donor("andrea@example.cz", "4821937560");
        former.verifyEmail(NOW);
        former.grantAdministration();
        former.revokeAdministration();
        when(donors.findById(former.id())).thenReturn(Optional.of(former));

        AdminAccountsSyncSnapshot snapshot = service.snapshotFor(former.id());

        assertThat(snapshot.administrator()).isFalse();
        assertThat(snapshot.accounts()).isEmpty();
        assertThat(snapshot.actions()).isEmpty();
        verifyNoInteractions(secondFactors, passkeys, trail);
    }

    @Test
    @DisplayName("Given an account that is gone, when its accounts snapshot is taken, then it holds no rows")
    void should_hold_no_rows_when_snapshot_taken_given_unknown_account() {
        DonorId unknown = DonorId.newId(NOW);
        when(donors.findById(unknown)).thenReturn(Optional.empty());

        assertThat(service.snapshotFor(unknown).administrator()).isFalse();
        verifyNoInteractions(secondFactors, passkeys, trail);
    }

    @Test
    @DisplayName("Given an administrator, a donor with a second factor and passkeys and the trail, when the snapshot is taken, then every account comes with its factor and passkey count, and the whole trail with the donor each action is about")
    void should_list_every_account_with_factor_and_passkeys_when_snapshot_taken_given_administrator() {
        Donor admin = donor("andrea@example.cz", "4821937560");
        admin.verifyEmail(NOW);
        admin.grantAdministration();
        Donor jana = donor("jana@example.cz", "4821937561");
        AdminActionEntry granted = new AdminActionEntry(UUID.randomUUID(), admin.id().value(), "GRANT_ADMINISTRATION", Optional.of(jana.id().value()),
                "Role správce udělena dárci " + jana.id().value(), NOW, Optional.empty());
        AdminActionEntry unknown = new AdminActionEntry(UUID.randomUUID(), admin.id().value(), "SOMETHING_NEW", Optional.empty(), "Něco se stalo", NOW,
                Optional.of("claude.ai"));
        when(donors.findById(admin.id())).thenReturn(Optional.of(admin));
        when(donors.findAll()).thenReturn(List.of(admin, jana));
        when(secondFactors.findDonorsWithEnabledFactor()).thenReturn(Set.of(jana.id()));
        when(passkeys.countByDonors()).thenReturn(Map.of(jana.id(), 2));
        when(trail.findAllNewestFirst()).thenReturn(List.of(granted, unknown));

        AdminAccountsSyncSnapshot snapshot = service.snapshotFor(admin.id());

        assertThat(snapshot.administrator()).isTrue();
        assertThat(snapshot.accounts()).containsExactly(new DonorAccountView(admin, false, 0), new DonorAccountView(jana, true, 2));
        assertThat(snapshot.actions()).extracting(AdminActionView::id).containsExactly(granted.id(), unknown.id());
        assertThat(snapshot.actions().getFirst().admin()).contains(admin);
        assertThat(snapshot.actions().getFirst().donorId()).contains(jana.id().value());
        assertThat(snapshot.actions().getFirst().donor()).contains(jana);
        assertThat(snapshot.actions().getLast().facts()).isEmpty();
        assertThat(snapshot.actions().getLast().donor()).isEmpty();
    }

    private static Donor donor(String email, String variableSymbol) {
        return Donor.register(DonorId.newId(NOW), DonorType.PERSON, "Jana Nováková", null,
                new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"), new EmailAddress(email), new PasswordHash("$hash"),
                new VariableSymbol(variableSymbol), LocaleCode.CS, NOW);
    }
}
