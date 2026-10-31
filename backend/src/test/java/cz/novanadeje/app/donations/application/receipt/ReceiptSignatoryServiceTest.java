package cz.novanadeje.app.donations.application.receipt;

import cz.novanadeje.app.donations.domain.receipt.PersonReference;
import cz.novanadeje.app.donations.domain.receipt.ReceiptPersonNotFound;
import cz.novanadeje.app.donations.domain.receipt.ReceiptSignatoryNeedsRenaming;
import cz.novanadeje.app.donations.domain.receipt.ReceiptSignatoryUnprintable;
import cz.novanadeje.app.donations.domain.receipt.ReceiptSignatory;
import cz.novanadeje.app.donations.domain.receipt.ReceiptSignatoryRepository;
import cz.novanadeje.app.donations.domain.receipt.ReceiptSignatureRepository;
import cz.novanadeje.app.donations.domain.receipt.SignatureKind;
import cz.novanadeje.app.donations.domain.receipt.SignatureSummary;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import cz.novanadeje.app.shared.application.people.FoundationPeople;
import cz.novanadeje.app.shared.application.people.FoundationPerson;
import cz.novanadeje.app.shared.application.people.PrintPortrait;
import cz.novanadeje.app.support.MutableClock;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.springframework.context.ApplicationEventPublisher;

import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class ReceiptSignatoryServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-31T09:00:00Z");
    private static final Instant EARLIER = Instant.parse("2026-10-01T09:00:00Z");
    private static final UUID ADMIN = UUID.fromString("01a18e56-bdb0-775a-bd0a-a60756831369");
    private static final PersonReference CHAIR = new PersonReference(UUID.fromString("019a3a00-0000-7000-8000-00000000f001"));
    private static final PersonReference OTHER = new PersonReference(UUID.fromString("019a3a00-0000-7000-8000-00000000f002"));

    private final ReceiptSignatoryRepository signatories = mock(ReceiptSignatoryRepository.class);
    private final ReceiptSignatureRepository signatures = mock(ReceiptSignatureRepository.class);
    private final FoundationPeople people = mock(FoundationPeople.class);
    private final ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
    private final ReceiptSignatoryService service = new ReceiptSignatoryService(signatories, signatures, people, events,
            new MutableClock(NOW, ZoneId.of("Europe/Prague")));

    @Test
    @DisplayName("Given no signatory chosen, when the signatory is viewed, then none is chosen and the uploaded signatures are listed")
    void should_answer_no_signatory_when_viewed_given_none_chosen() {
        SignatureSummary summary = new SignatureSummary(OTHER, SignatureKind.VECTOR, 1200, 400, EARLIER);
        when(signatories.current()).thenReturn(Optional.empty());
        when(signatures.summaries()).thenReturn(List.of(summary));

        assertThat(service.view()).isEqualTo(new ReceiptSignatoryView(Optional.empty(), List.of(summary)));
    }

    @Test
    @DisplayName("Given a signatory chosen who has a portrait and a signature, when viewed, then their name, receipt role and both images are named")
    void should_name_person_role_and_images_when_viewed_given_chosen_signatory() {
        when(signatories.current()).thenReturn(Optional.of(new ReceiptSignatory(CHAIR, "předseda správní rady", EARLIER)));
        when(signatures.summaries()).thenReturn(List.of(new SignatureSummary(CHAIR, SignatureKind.RASTER, 600, 200, EARLIER)));
        when(people.find(CHAIR.value())).thenReturn(Optional.of(new FoundationPerson(CHAIR.value(), "Josef Vzorový", true)));
        when(people.printPortraitOf(CHAIR.value())).thenReturn(Optional.of(new PrintPortrait(new byte[] {(byte) 0xff, (byte) 0xd8, 0}, PrintPortrait.SIDE)));

        assertThat(service.view().chosen())
                .contains(new ChosenSignatoryView(CHAIR, "Josef Vzorový", "předseda správní rady", EARLIER, true, true, true));
    }

    @Test
    @DisplayName("Given a signatory whose portrait cannot be prepared for print, when viewed, then the portrait is named as set but not printable")
    void should_name_portrait_unprintable_when_viewed_given_portrait_that_cannot_be_prepared() {
        when(signatories.current()).thenReturn(Optional.of(new ReceiptSignatory(CHAIR, "předseda správní rady", EARLIER)));
        when(signatures.summaries()).thenReturn(List.of());
        when(people.find(CHAIR.value())).thenReturn(Optional.of(new FoundationPerson(CHAIR.value(), "Josef Vzorový", true)));
        when(people.printPortraitOf(CHAIR.value())).thenReturn(Optional.empty());

        assertThat(service.view().chosen())
                .contains(new ChosenSignatoryView(CHAIR, "Josef Vzorový", "předseda správní rady", EARLIER, true, false, false));
    }

    @Test
    @DisplayName("Given a signatory chosen whose person is gone, when viewed, then none is chosen")
    void should_answer_no_signatory_when_viewed_given_person_gone() {
        when(signatories.current()).thenReturn(Optional.of(new ReceiptSignatory(CHAIR, "předseda správní rady", EARLIER)));
        when(signatures.summaries()).thenReturn(List.of());
        when(people.find(CHAIR.value())).thenReturn(Optional.empty());

        assertThat(service.view().chosen()).isEmpty();
    }

    @Test
    @DisplayName("Given a person of the foundation, when an administrator chooses them with a receipt role, then the choice is stored, audited and returned")
    void should_store_and_audit_when_chosen_given_person() {
        when(people.findForUpdate(CHAIR.value())).thenReturn(Optional.of(new FoundationPerson(CHAIR.value(), "Josef Vzorový", false)));
        when(signatures.digestOf(CHAIR)).thenReturn(Optional.empty());

        ChosenSignatoryView chosen = service.choose(ADMIN, CHAIR, "  předseda správní rady ");

        assertThat(chosen).isEqualTo(new ChosenSignatoryView(CHAIR, "Josef Vzorový", "předseda správní rady", NOW, false, false, false));
        verify(signatories).choose(new ReceiptSignatory(CHAIR, "předseda správní rady", NOW));
        ArgumentCaptor<AdminActionPerformed> published = ArgumentCaptor.forClass(AdminActionPerformed.class);
        verify(events).publishEvent(published.capture());
        assertThat(published.getValue().action()).isEqualTo("CHOOSE_RECEIPT_SIGNATORY");
        assertThat(published.getValue().adminId()).isEqualTo(ADMIN);
        assertThat(published.getValue().details())
                .isEqualTo("Potvrzení o daru podepisuje osoba " + CHAIR)
                .doesNotContain("Josef")
                .doesNotContain("předseda");
        assertThat(published.getValue().performedAt()).isEqualTo(NOW);
    }

    @Test
    @DisplayName("Given a person the foundation does not have, when an administrator chooses them, then it is refused as not found and nothing changes")
    void should_refuse_as_not_found_when_chosen_given_unknown_person() {
        when(people.findForUpdate(OTHER.value())).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.choose(ADMIN, OTHER, "předseda")).isInstanceOf(ReceiptPersonNotFound.class);

        verify(signatories, never()).choose(any());
        verifyNoInteractions(events);
    }

    @Test
    @DisplayName("Given a person whose stored name or role holds a control character, when an administrator chooses them, then it is refused until they are renamed and nothing changes")
    void should_refuse_until_renamed_when_chosen_given_a_control_character() {
        when(people.findForUpdate(CHAIR.value())).thenReturn(Optional.of(new FoundationPerson(CHAIR.value(), "Josef\nVzorový", false, true)));

        assertThatThrownBy(() -> service.choose(ADMIN, CHAIR, "předseda")).isInstanceOf(ReceiptSignatoryNeedsRenaming.class)
                .hasMessageNotContaining("Josef");

        verify(signatories, never()).choose(any());
        verifyNoInteractions(events);
    }

    @Test
    @DisplayName("Given a person whose name holds a character no receipt can print, when an administrator chooses them, then it is refused until they are renamed and nothing changes")
    void should_refuse_until_renamed_when_chosen_given_an_unprintable_name() {
        when(people.findForUpdate(CHAIR.value())).thenReturn(Optional.of(new FoundationPerson(CHAIR.value(), "Josef Vzorový 😀", false)));

        assertThatThrownBy(() -> service.choose(ADMIN, CHAIR, "předseda")).isInstanceOf(ReceiptSignatoryUnprintable.class)
                .hasFieldOrPropertyWithValue("code", "donations/signatory-unprintable")
                .hasMessageNotContaining("Josef");

        verify(signatories, never()).choose(any());
        verifyNoInteractions(events);
    }

    @Test
    @DisplayName("Given a person of the foundation, when an administrator chooses them, then the person is read with a lock before the choice is stored")
    void should_lock_person_before_storing_when_chosen_given_person() {
        when(people.findForUpdate(CHAIR.value())).thenReturn(Optional.of(new FoundationPerson(CHAIR.value(), "Josef Vzorový", false)));
        when(signatures.digestOf(CHAIR)).thenReturn(Optional.empty());

        service.choose(ADMIN, CHAIR, "předseda správní rady");

        InOrder order = inOrder(people, signatories);
        order.verify(people).findForUpdate(CHAIR.value());
        order.verify(signatories).choose(any());
        verify(people, never()).find(any());
    }
}
