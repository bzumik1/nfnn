package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.PasskeyRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PasskeySiteCleanupServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-24T10:00:00Z");

    @Mock
    private PasskeyRepository passkeys;
    @Mock
    private PasskeyCeremonies ceremonies;

    private PasskeySiteCleanupService service;

    @BeforeEach
    void setUp() {
        service = new PasskeySiteCleanupService(passkeys, ceremonies);
    }

    @Test
    @DisplayName("Given the site moved to another address, when the keys of other sites are removed, then older unmarked keys count as this site's first and the donors who lost keys are counted")
    void should_adopt_unmarked_keys_then_remove_keys_of_other_sites_when_cleaned_up() {
        when(ceremonies.relyingPartyId()).thenReturn("nfnn.cz");
        when(passkeys.deleteOfOtherSites("nfnn.cz")).thenReturn(List.of(DonorId.newId(NOW), DonorId.newId(NOW.plusSeconds(1))));

        int donors = service.removeKeysOfOtherSites();

        assertThat(donors).isEqualTo(2);
        InOrder order = inOrder(passkeys);
        order.verify(passkeys).adoptUnmarked("nfnn.cz");
        order.verify(passkeys).deleteOfOtherSites("nfnn.cz");
    }
}
