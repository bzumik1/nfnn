package cz.novanadeje.app.donations.domain.donor;

import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.bank.BankPaymentId;
import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Optional;

import static cz.novanadeje.app.donations.BankPayments.payment;
import static cz.novanadeje.app.shared.domain.Money.czk;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.assertj.core.api.Assertions.assertThatIllegalStateException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SenderAccountLinkTest {

    private static final Instant NOW = Instant.parse("2026-10-17T10:00:00Z");
    private static final SenderAccount ACCOUNT = new SenderAccount("2900233333", "2010");
    private static final LocalDate FROM = LocalDate.of(2026, 10, 1);
    private static final LocalDate TO = LocalDate.of(2026, 10, 10);

    @Test
    @DisplayName("Given a link proved since always, when asked about any day, then it pairs payments booked on it")
    void should_pair_any_day_when_asked_given_link_since_always() {
        SenderAccountLink link = SenderAccountLink.provedBy(SenderAccountLinkId.newId(NOW), payment(1, Optional.of(ACCOUNT), "4821937560"),
                Optional.empty(), NOW);

        assertThat(link.pairsPaymentsBookedOn(LocalDate.of(1999, 1, 1))).isTrue();
        assertThat(link.pairsPaymentsBookedOn(LocalDate.of(2099, 1, 1))).isTrue();
        assertThat(link.isActive()).isTrue();
        assertThat(link.isLive()).isTrue();
    }

    @Test
    @DisplayName("Given a link with a start and an end, when asked, then it pairs payments booked on both days and between them only")
    void should_pair_within_period_when_asked_given_bounded_link() {
        SenderAccountLink link = SenderAccountLink.reconstitute(SenderAccountLinkId.newId(NOW), ACCOUNT, SenderAccountLinkStatus.DISCONNECTED,
                Optional.of(BankPaymentId.newId(NOW)), Optional.of(NOW), Optional.of(FROM), Optional.of(TO), NOW, Optional.of(NOW));

        assertThat(link.pairsPaymentsBookedOn(FROM.minusDays(1))).isFalse();
        assertThat(link.pairsPaymentsBookedOn(FROM)).isTrue();
        assertThat(link.pairsPaymentsBookedOn(TO)).isTrue();
        assertThat(link.pairsPaymentsBookedOn(TO.plusDays(1))).isFalse();
        assertThat(link.isLive()).isFalse();
    }

    @Test
    @DisplayName("Given a link awaiting a payment, when asked, then it pairs nothing and only a payment from its account booked from its start proves it")
    void should_pair_nothing_until_proved_when_asked_given_awaiting_link() {
        SenderAccountLink link = SenderAccountLink.awaitingPayment(SenderAccountLinkId.newId(NOW), ACCOUNT, FROM, NOW);
        BankPayment early = payment(1, FROM.minusDays(1), czk(100), Optional.of(ACCOUNT), "4821937560");
        BankPayment otherAccount = payment(2, FROM, czk(100), Optional.of(new SenderAccount("1234567", "0800")), "4821937560");
        BankPayment proof = payment(3, FROM, czk(100), Optional.of(ACCOUNT), "4821937560");

        assertThat(link.pairsPaymentsBookedOn(FROM)).isFalse();
        assertThat(link.isProvedBy(early)).isFalse();
        assertThat(link.isProvedBy(otherAccount)).isFalse();
        assertThat(link.isProvedBy(proof)).isTrue();
        assertThatIllegalStateException().isThrownBy(() -> link.prove(early, NOW));

        link.prove(proof, NOW);

        assertThat(link.status()).isEqualTo(SenderAccountLinkStatus.ACTIVE);
        assertThat(link.provedBy()).contains(proof.id());
        assertThat(link.pairsPaymentsBookedOn(FROM)).isTrue();
        assertThat(link.isProvedBy(proof)).isFalse();
    }

    @Test
    @DisplayName("Given a payment without a Czech sender, when it should prove a link, then it is refused")
    void should_refuse_when_proved_given_payment_without_sender() {
        assertThatIllegalArgumentException().isThrownBy(() -> SenderAccountLink.provedBy(SenderAccountLinkId.newId(NOW),
                payment(1, Optional.empty(), "4821937560"), Optional.empty(), NOW));
    }

    @Test
    @DisplayName("Given an awaiting link disconnected on the day it starts, when asked, then it is disconnected and still pairs nothing")
    void should_pair_nothing_when_disconnected_given_awaiting_link() {
        SenderAccountLink link = SenderAccountLink.awaitingPayment(SenderAccountLinkId.newId(NOW), ACCOUNT, FROM, NOW);

        link.disconnect(FROM, NOW);

        assertThat(link.status()).isEqualTo(SenderAccountLinkStatus.DISCONNECTED);
        assertThat(link.validTo()).contains(FROM);
        assertThat(link.pairsPaymentsBookedOn(FROM)).isFalse();
        assertThatThrownBy(() -> link.disconnect(FROM, NOW)).isInstanceOf(SenderAccountAlreadyDisconnected.class);
    }

    @Test
    @DisplayName("Given inconsistent stored states, when reconstituted, then each is refused")
    void should_refuse_when_reconstituted_given_inconsistent_state() {
        SenderAccountLinkId id = SenderAccountLinkId.newId(NOW);
        Optional<BankPaymentId> proof = Optional.of(BankPaymentId.newId(NOW));

        assertThatIllegalArgumentException().isThrownBy(() -> SenderAccountLink.reconstitute(id, ACCOUNT, SenderAccountLinkStatus.ACTIVE,
                Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty(), NOW, Optional.empty()));
        assertThatIllegalArgumentException().isThrownBy(() -> SenderAccountLink.reconstitute(id, ACCOUNT, SenderAccountLinkStatus.ACTIVE,
                proof, Optional.empty(), Optional.empty(), Optional.empty(), NOW, Optional.empty()));
        assertThatIllegalArgumentException().isThrownBy(() -> SenderAccountLink.reconstitute(id, ACCOUNT, SenderAccountLinkStatus.AWAITING_PAYMENT,
                proof, Optional.of(NOW), Optional.of(FROM), Optional.empty(), NOW, Optional.empty()));
        assertThatIllegalArgumentException().isThrownBy(() -> SenderAccountLink.reconstitute(id, ACCOUNT, SenderAccountLinkStatus.AWAITING_PAYMENT,
                Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty(), NOW, Optional.empty()));
        assertThatIllegalArgumentException().isThrownBy(() -> SenderAccountLink.reconstitute(id, ACCOUNT, SenderAccountLinkStatus.DISCONNECTED,
                proof, Optional.of(NOW), Optional.empty(), Optional.empty(), NOW, Optional.of(NOW)));
        assertThatIllegalArgumentException().isThrownBy(() -> SenderAccountLink.reconstitute(id, ACCOUNT, SenderAccountLinkStatus.ACTIVE,
                proof, Optional.of(NOW), Optional.empty(), Optional.of(TO), NOW, Optional.empty()));
        assertThatIllegalArgumentException().isThrownBy(() -> SenderAccountLink.reconstitute(id, ACCOUNT, SenderAccountLinkStatus.DISCONNECTED,
                proof, Optional.of(NOW), Optional.of(TO), Optional.of(FROM), NOW, Optional.of(NOW)));
    }
}
