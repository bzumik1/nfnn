package cz.novanadeje.app.operations.domain.push;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PushMessageTest {

    @Test
    @DisplayName("Given a notification to donors, when it names a count, then it is refused, so a donor's lock screen and the app badge never get one")
    void should_refuse_count_when_created_given_donor_notification() {
        assertThatThrownBy(() -> new PushMessage(PushMessageKind.DONOR_TEST, 1)).isInstanceOf(IllegalArgumentException.class);
        assertThat(new PushMessage(PushMessageKind.DONOR_TEST, 0).count()).isZero();
    }

    @Test
    @DisplayName("Given an alert to administrators, when it names the count of open alerts, then it carries it")
    void should_carry_count_when_created_given_administrator_alert() {
        assertThat(new PushMessage(PushMessageKind.TEST, 3).count()).isEqualTo(3);
        assertThat(PushMessageKind.TEST.carriesOpenAlertCount()).isTrue();
        assertThat(PushMessageKind.DONOR_TEST.carriesOpenAlertCount()).isFalse();
    }
}
