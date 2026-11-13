package cz.novanadeje.app.donations.infrastructure.pairing;

import cz.novanadeje.app.donations.application.pairing.PairingOutcome;
import cz.novanadeje.app.donations.application.pairing.PairingRaceLost;
import cz.novanadeje.app.donations.application.pairing.PaymentPairingService;
import cz.novanadeje.app.donations.domain.donor.DonorReference;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.dao.CannotAcquireLockException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.PessimisticLockingFailureException;
import org.springframework.dao.QueryTimeoutException;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class RaceAwareDonorPaymentsPairingTest {

    private static final DonorReference DONOR = new DonorReference(UUID.fromString("019a0000-0000-7000-8000-000000000001"));
    private static final Instant NOW = Instant.parse("2026-10-23T08:00:00Z");

    private final PaymentPairingService service = mock(PaymentPairingService.class);
    private final RaceAwareDonorPaymentsPairing pairing = new RaceAwareDonorPaymentsPairing(service);

    @Test
    @DisplayName("Given pairing that completes, when the donor's payments are paired, then its outcome is returned unchanged")
    void should_return_outcome_when_paired_given_pairing_completes() {
        PairingOutcome outcome = new PairingOutcome(1, 1, 0, 1, 0);
        when(service.pairPaymentsOf(DONOR, NOW)).thenReturn(Optional.of(outcome));

        assertThat(pairing.pairPaymentsOf(DONOR, NOW)).contains(outcome);
    }

    @Test
    @DisplayName("Given a donor unknown to donations, when the donor's payments are paired, then nothing is returned")
    void should_return_nothing_when_paired_given_unknown_donor() {
        when(service.pairPaymentsOf(DONOR, NOW)).thenReturn(Optional.empty());

        assertThat(pairing.pairPaymentsOf(DONOR, NOW)).isEmpty();
    }

    @Test
    @DisplayName("Given the import paired the same bank payment first, when the donor's payments are paired, then the integrity violation becomes a lost race")
    void should_report_lost_race_when_paired_given_integrity_violation() {
        DataIntegrityViolationException violation = new DataIntegrityViolationException("uq_donation_bank_payment");
        when(service.pairPaymentsOf(DONOR, NOW)).thenThrow(violation);

        assertThatThrownBy(() -> pairing.pairPaymentsOf(DONOR, NOW)).isInstanceOf(PairingRaceLost.class).hasCause(violation);
    }

    @Test
    @DisplayName("Given a deadlock with the import, when the donor's payments are paired, then the lock failure becomes a lost race")
    void should_report_lost_race_when_paired_given_deadlock() {
        CannotAcquireLockException deadlock = new CannotAcquireLockException("deadlock detected");
        when(service.pairPaymentsOf(DONOR, NOW)).thenThrow(deadlock);

        assertThatThrownBy(() -> pairing.pairPaymentsOf(DONOR, NOW)).isInstanceOf(PairingRaceLost.class).hasCause(deadlock);
    }

    @Test
    @DisplayName("Given a pairing lock wait that runs out, when the donor's payments are paired, then the pessimistic locking failure becomes a lost race")
    void should_report_lost_race_when_paired_given_pairing_lock_wait_runs_out() {
        PessimisticLockingFailureException timeout = new PessimisticLockingFailureException("lock timeout");
        when(service.pairPaymentsOf(DONOR, NOW)).thenThrow(timeout);

        assertThatThrownBy(() -> pairing.pairPaymentsOf(DONOR, NOW)).isInstanceOf(PairingRaceLost.class).hasCause(timeout);
    }

    @Test
    @DisplayName("Given any other failure, when the donor's payments are paired, then it is passed on unchanged")
    void should_pass_other_failure_on_when_paired_given_statement_timeout() {
        QueryTimeoutException timeout = new QueryTimeoutException("statement timeout");
        when(service.pairPaymentsOf(DONOR, NOW)).thenThrow(timeout);

        assertThatThrownBy(() -> pairing.pairPaymentsOf(DONOR, NOW)).isSameAs(timeout);
    }
}
