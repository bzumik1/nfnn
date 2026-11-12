package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.Role;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.List;
import java.util.Set;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class RestoredErasuresTest {

    private static final Instant NOW = Instant.parse("2026-11-06T09:00:00Z");
    private static final PostalAddress ADDRESS = new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01");

    @Mock
    private DonorRepository donors;
    @Mock
    private DonorErasureService erasures;

    @Test
    @DisplayName("Given an erased donor whose personal data a restore brought back, one erased in full and one whose completion fails, when the backend has started, then each one with data left is completed and a failure does not stop the next")
    void should_complete_every_incomplete_erasure_when_started_given_erased_donors_after_a_restore() {
        Donor erasedInFull = donor("Petr Svoboda", "petr@example.cz", "7310945528", null);
        erasedInFull.erase(NOW.minusSeconds(60));
        Donor failing = donor("Jana Nováková", "jana@example.cz", "7310945529", NOW.minusSeconds(3600));
        Donor broughtBack = donor("Eva Dvořáková", "eva@example.cz", "7310945530", NOW.minusSeconds(3600));
        when(donors.findErased()).thenReturn(List.of(erasedInFull, failing, broughtBack));
        when(erasures.completeRestoredErasure(failing.id())).thenThrow(new IllegalStateException("the database went away"));

        new RestoredErasures(donors, erasures).completeErasuresARestoreBroughtBack();

        verify(erasures).completeRestoredErasure(failing.id());
        verify(erasures).completeRestoredErasure(broughtBack.id());
        verify(erasures, never()).completeRestoredErasure(erasedInFull.id());
    }

    @Test
    @DisplayName("Given no erased donor, when the backend has started, then nothing is completed")
    void should_complete_nothing_when_started_given_no_erased_donor() {
        when(donors.findErased()).thenReturn(List.of());

        new RestoredErasures(donors, erasures).completeErasuresARestoreBroughtBack();

        verify(erasures, never()).completeRestoredErasure(any());
    }

    private static Donor donor(String name, String email, String symbol, Instant erasedAt) {
        return Donor.reconstitute(DonorId.newId(NOW), DonorType.PERSON, name, null, ADDRESS, new EmailAddress(email), new PasswordHash("$hash"),
                new VariableSymbol(symbol), LocaleCode.CS, Set.of(Role.DONOR), NOW.minusSeconds(7200), NOW.minusSeconds(7100), erasedAt);
    }
}
