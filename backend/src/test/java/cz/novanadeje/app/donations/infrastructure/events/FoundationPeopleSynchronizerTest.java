package cz.novanadeje.app.donations.infrastructure.events;

import cz.novanadeje.app.donations.application.receipt.ReceiptSignatureService;
import cz.novanadeje.app.donations.domain.receipt.PersonReference;
import cz.novanadeje.app.shared.application.event.FoundationPersonRemoved;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.UUID;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class FoundationPeopleSynchronizerTest {

    private final ReceiptSignatureService signatures = mock(ReceiptSignatureService.class);
    private final FoundationPeopleSynchronizer synchronizer = new FoundationPeopleSynchronizer(signatures);

    @Test
    @DisplayName("Given a person of the foundation removed, when the event arrives, then their receipt signature is forgotten")
    void should_forget_signature_when_event_arrives_given_person_removed() {
        UUID person = UUID.fromString("019a3a00-0000-7000-8000-00000000f003");

        synchronizer.onRemoved(new FoundationPersonRemoved(person, Instant.parse("2026-10-31T09:00:00Z")));

        verify(signatures).forget(new PersonReference(person));
    }
}
