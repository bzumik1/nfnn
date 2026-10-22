package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.PasswordHash;
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

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdministratorActivityServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-22T21:00:00Z");
    private static final DonorId JANA = DonorId.newId(NOW.minusSeconds(300));
    private static final UUID FORMER_ADMIN = UUID.fromString("0192f0f1-0000-7000-8000-000000000009");
    private static final UUID SUBJECT = UUID.fromString("0192f0f1-0000-7000-8000-000000000001");

    @Mock
    private AdminActionTrail trail;
    @Mock
    private DonorRepository donors;

    private AdministratorActivityService service;

    @BeforeEach
    void setUp() {
        service = new AdministratorActivityService(trail, donors, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    @DisplayName("Given actions by a current and a former administrator, when the trail is listed, then each action names its administrator when known")
    void should_name_administrators_when_listed_given_known_and_unknown_admins() {
        AdminActionEntry byJana = entry(JANA.value(), "GRANT_ADMINISTRATION", NOW.minusSeconds(10));
        AdminActionEntry byFormer = entry(FORMER_ADMIN, "PAIR_PAYMENT", NOW.minusSeconds(20));
        when(trail.findPerformedBefore(NOW.plusSeconds(1), 51)).thenReturn(List.of(byJana, byFormer));
        Donor jana = donor(JANA, "Jana Nováková");
        when(donors.findByIds(List.of(JANA, new DonorId(FORMER_ADMIN)))).thenReturn(List.of(jana));

        AdministratorActivity activity = service.list(Optional.empty(), 50);

        assertThat(activity.hasMore()).isFalse();
        assertThat(activity.items()).extracting(AdminActionView::id).containsExactly(byJana.id(), byFormer.id());
        assertThat(activity.items().getFirst().admin()).contains(jana);
        assertThat(activity.items().getFirst().action()).isEqualTo("GRANT_ADMINISTRATION");
        assertThat(activity.items().getFirst().subjectId()).contains(SUBJECT);
        assertThat(activity.items().getLast().admin()).isEmpty();
        assertThat(activity.items().getLast().adminId()).isEqualTo(FORMER_ADMIN);
    }

    @Test
    @DisplayName("Given more actions than the page holds, when a page is listed, then only the page comes and it says more follow")
    void should_cut_page_and_flag_more_when_listed_given_more_actions_than_limit() {
        Instant before = NOW.minusSeconds(5);
        AdminActionEntry first = entry(JANA.value(), "PAIR_PAYMENT", NOW.minusSeconds(10));
        AdminActionEntry second = entry(JANA.value(), "UNPAIR_PAYMENT", NOW.minusSeconds(20));
        AdminActionEntry third = entry(JANA.value(), "PAIR_PAYMENT", NOW.minusSeconds(30));
        when(trail.findPerformedBefore(before, 3)).thenReturn(List.of(first, second, third));
        when(donors.findByIds(anyCollection())).thenReturn(List.of(donor(JANA, "Jana Nováková")));

        AdministratorActivity activity = service.list(Optional.of(before), 2);

        assertThat(activity.hasMore()).isTrue();
        assertThat(activity.items()).extracting(AdminActionView::id).containsExactly(first.id(), second.id());
        verify(donors).findByIds(List.of(JANA));
    }

    @Test
    @DisplayName("Given no actions, when the trail is listed, then the page is empty and no donor is looked up")
    void should_return_empty_page_when_listed_given_no_actions() {
        when(trail.findPerformedBefore(NOW.plusSeconds(1), 51)).thenReturn(List.of());
        when(donors.findByIds(List.of())).thenReturn(List.of());

        AdministratorActivity activity = service.list(Optional.empty(), 50);

        assertThat(activity.items()).isEmpty();
        assertThat(activity.hasMore()).isFalse();
    }

    @Test
    @DisplayName("Given a page size outside 1 to 200, when the trail is listed, then the request is refused before any lookup")
    void should_refuse_when_listed_given_page_size_out_of_range() {
        assertThatThrownBy(() -> service.list(Optional.empty(), 0)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.list(Optional.empty(), 201)).isInstanceOf(IllegalArgumentException.class);
        verifyNoInteractions(trail, donors);
    }

    private static AdminActionEntry entry(UUID adminId, String action, Instant at) {
        return new AdminActionEntry(UUID.randomUUID(), adminId, action, Optional.of(SUBJECT), "details of " + action, at);
    }

    private static Donor donor(DonorId id, String name) {
        return Donor.register(id, DonorType.PERSON, name, null, new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"),
                new EmailAddress("jana@example.cz"), new PasswordHash("$hash"), new VariableSymbol("4821937560"), LocaleCode.CS, NOW);
    }
}
