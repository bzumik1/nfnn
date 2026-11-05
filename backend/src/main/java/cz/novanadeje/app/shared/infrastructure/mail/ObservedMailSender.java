package cz.novanadeje.app.shared.infrastructure.mail;

import cz.novanadeje.app.shared.application.event.MailDeliveryFailed;
import cz.novanadeje.app.shared.application.event.MailDeliverySucceeded;
import jakarta.mail.AuthenticationFailedException;
import jakarta.mail.MessagingException;
import jakarta.mail.SendFailedException;
import jakarta.mail.internet.MimeMessage;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.mail.MailAuthenticationException;
import org.springframework.mail.MailException;
import org.springframework.mail.MailSendException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.time.Clock;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Deque;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Set;

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
            if (!refusedOnlyRecipients(refused)) {
                events.publishEvent(new MailDeliveryFailed(clock.instant()));
            }
            throw refused;
        }
        events.publishEvent(new MailDeliverySucceeded(clock.instant()));
    }

    private static boolean refusedOnlyRecipients(MailException refused) {
        if (refused instanceof MailAuthenticationException) {
            return false;
        }
        List<Throwable> chain = causesOf(refused);
        return chain.stream().anyMatch(ObservedMailSender::namesRefusedRecipients)
                && chain.stream().noneMatch(cause -> cause instanceof MailAuthenticationException || cause instanceof AuthenticationFailedException
                || cause instanceof IOException);
    }

    private static boolean namesRefusedRecipients(Throwable cause) {
        return cause instanceof SendFailedException failed && failed.getInvalidAddresses() != null && failed.getInvalidAddresses().length > 0;
    }

    private static List<Throwable> causesOf(Throwable failure) {
        Set<Throwable> seen = Collections.newSetFromMap(new IdentityHashMap<>());
        List<Throwable> chain = new ArrayList<>();
        Deque<Throwable> pending = new ArrayDeque<>();
        pending.add(failure);
        while (!pending.isEmpty()) {
            Throwable next = pending.poll();
            if (!seen.add(next)) {
                continue;
            }
            chain.add(next);
            if (next.getCause() != null) {
                pending.add(next.getCause());
            }
            if (next instanceof MessagingException messaging && messaging.getNextException() != null) {
                pending.add(messaging.getNextException());
            }
            if (next instanceof MailSendException send) {
                pending.addAll(send.getFailedMessages().values());
            }
        }
        return chain;
    }
}
