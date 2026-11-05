package cz.novanadeje.app.shared.infrastructure.mail;

import cz.novanadeje.app.shared.application.event.MailDeliveryFailed;
import cz.novanadeje.app.shared.application.event.MailDeliverySucceeded;
import jakarta.mail.internet.MimeMessage;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

import java.time.Clock;

@Component
public class ObservedMailSender {

    private final JavaMailSender mailSender;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public ObservedMailSender(JavaMailSender mailSender, ApplicationEventPublisher events, Clock clock) {
        this.mailSender = mailSender;
        this.events = events;
        this.clock = clock;
    }

    public void send(MimeMessage message) {
        try {
            mailSender.send(message);
        } catch (MailException refused) {
            events.publishEvent(new MailDeliveryFailed(clock.instant()));
            throw refused;
        }
        events.publishEvent(new MailDeliverySucceeded(clock.instant()));
    }
}
