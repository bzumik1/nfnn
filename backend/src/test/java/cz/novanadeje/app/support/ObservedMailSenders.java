package cz.novanadeje.app.support;

import cz.novanadeje.app.shared.infrastructure.mail.ObservedMailSender;
import org.springframework.mail.javamail.JavaMailSender;

import java.time.Clock;

public final class ObservedMailSenders {

    private ObservedMailSenders() {
    }

    public static ObservedMailSender of(JavaMailSender mailSender) {
        return new ObservedMailSender(mailSender, event -> {
        }, Clock.systemUTC());
    }
}
