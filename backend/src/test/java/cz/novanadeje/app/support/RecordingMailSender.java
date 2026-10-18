package cz.novanadeje.app.support;

import jakarta.mail.internet.MimeMessage;
import org.springframework.mail.MailSendException;
import org.springframework.mail.javamail.JavaMailSenderImpl;

import java.util.Arrays;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicBoolean;

public class RecordingMailSender extends JavaMailSenderImpl {

    private final List<MimeMessage> sent = new CopyOnWriteArrayList<>();
    private final AtomicBoolean refuseNext = new AtomicBoolean();

    @Override
    protected void doSend(MimeMessage[] mimeMessages, Object[] originalMessages) {
        if (refuseNext.compareAndSet(true, false)) {
            throw new MailSendException("The recording mail server refused the e-mail");
        }
        sent.addAll(Arrays.asList(mimeMessages));
    }

    public void failNextSend() {
        refuseNext.set(true);
    }

    public List<MimeMessage> sent() {
        return List.copyOf(sent);
    }

    public void clear() {
        sent.clear();
        refuseNext.set(false);
    }
}
