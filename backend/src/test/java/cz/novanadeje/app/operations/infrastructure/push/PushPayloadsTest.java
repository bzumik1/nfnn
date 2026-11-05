package cz.novanadeje.app.operations.infrastructure.push;

import cz.novanadeje.app.operations.domain.push.PushMessage;
import cz.novanadeje.app.operations.domain.push.PushMessageKind;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.context.support.StaticMessageSource;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PushPayloadsTest {

    @Test
    @DisplayName("Given a notification text too long for the padded length, when the message is written, then it is refused, so no message can stand out by its size")
    void should_refuse_when_written_given_a_text_too_long_for_the_padded_length() {
        StaticMessageSource messages = new StaticMessageSource();
        messages.addMessage("push.notification.test.title", PushPayloads.CZECH, "Zkušební upozornění");
        messages.addMessage("push.notification.test.body", PushPayloads.CZECH, "a".repeat(WebPushDelivery.PADDED_MESSAGE_BYTES));

        assertThatThrownBy(() -> new PushPayloads(messages).of(new PushMessage(PushMessageKind.TEST, 0)))
                .isInstanceOf(IllegalStateException.class);
    }
}
