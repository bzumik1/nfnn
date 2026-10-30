package cz.novanadeje.app.support;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import org.springframework.mail.MailSendException;
import org.springframework.mail.javamail.JavaMailSenderImpl;

import java.time.Duration;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.awaitility.Awaitility.await;

public class RecordingMailSender extends JavaMailSenderImpl {

    private final List<MimeMessage> sent = new CopyOnWriteArrayList<>();
    private final List<MimeMessage> sentInScenario = new CopyOnWriteArrayList<>();
    private final AtomicBoolean refuseNext = new AtomicBoolean();

    @Override
    protected void doSend(MimeMessage[] mimeMessages, Object[] originalMessages) {
        if (refuseNext.compareAndSet(true, false)) {
            throw new MailSendException("The recording mail server refused the e-mail");
        }
        sent.addAll(Arrays.asList(mimeMessages));
        sentInScenario.addAll(Arrays.asList(mimeMessages));
    }

    public void failNextSend() {
        refuseNext.set(true);
    }

    public List<MimeMessage> sent() {
        return List.copyOf(sent);
    }

    public void forgetOnceSent(String subject) {
        await().atMost(Duration.ofSeconds(5)).until(() -> sent.stream().anyMatch(message -> hasSubject(message, subject)));
        sent.stream().filter(message -> hasSubject(message, subject)).findFirst().ifPresent(sent::remove);
    }

    public List<MimeMessage> sentInScenario() {
        return List.copyOf(sentInScenario);
    }

    public void startScenario() {
        sentInScenario.clear();
    }

    public void clear() {
        sent.clear();
        refuseNext.set(false);
    }

    private static boolean hasSubject(MimeMessage message, String subject) {
        try {
            return subject.equals(message.getSubject());
        } catch (MessagingException unreadable) {
            return false;
        }
    }
}
