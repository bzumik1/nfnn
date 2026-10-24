package cz.novanadeje.app.operations.infrastructure.settings;

import cz.novanadeje.app.operations.application.settings.TestEmailOutcome;
import jakarta.mail.AuthenticationFailedException;
import jakarta.mail.MessagingException;
import jakarta.mail.SendFailedException;
import org.springframework.mail.MailAuthenticationException;
import org.springframework.mail.MailSendException;

import java.net.ConnectException;
import java.net.NoRouteToHostException;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Deque;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Set;

final class SmtpFailures {

    private static final String STARTTLS = "STARTTLS";

    private SmtpFailures() {
    }

    static TestEmailOutcome classify(Throwable failure) {
        List<Throwable> chain = flatten(failure);
        if (chain.stream().anyMatch(cause -> cause instanceof AuthenticationFailedException || cause instanceof MailAuthenticationException)) {
            return TestEmailOutcome.SIGN_IN_REFUSED;
        }
        if (chain.stream().anyMatch(SmtpFailures::isMissingStartTls)) {
            return TestEmailOutcome.STARTTLS_UNAVAILABLE;
        }
        if (chain.stream().anyMatch(SocketTimeoutException.class::isInstance)) {
            return TestEmailOutcome.TIMEOUT;
        }
        if (chain.stream().anyMatch(cause -> cause instanceof ConnectException || cause instanceof UnknownHostException
                || cause instanceof NoRouteToHostException)) {
            return TestEmailOutcome.UNREACHABLE;
        }
        if (chain.stream().anyMatch(SmtpFailures::namesRefusedRecipients)) {
            return TestEmailOutcome.RECIPIENT_REFUSED;
        }
        if (chain.stream().anyMatch(SendFailedException.class::isInstance)) {
            return TestEmailOutcome.SENDER_REFUSED;
        }
        return TestEmailOutcome.FAILED;
    }

    private static boolean isMissingStartTls(Throwable cause) {
        return cause instanceof MessagingException && !(cause instanceof SendFailedException) && cause.getMessage() != null
                && cause.getMessage().toUpperCase(Locale.ROOT).contains(STARTTLS);
    }

    private static boolean namesRefusedRecipients(Throwable cause) {
        return cause instanceof SendFailedException refused && refused.getInvalidAddresses() != null && refused.getInvalidAddresses().length > 0;
    }

    private static List<Throwable> flatten(Throwable failure) {
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
                pending.addAll(List.of(send.getMessageExceptions()));
            }
        }
        return chain;
    }
}
