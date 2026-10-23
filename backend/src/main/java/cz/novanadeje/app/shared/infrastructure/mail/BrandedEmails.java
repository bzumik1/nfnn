package cz.novanadeje.app.shared.infrastructure.mail;

import cz.novanadeje.app.shared.infrastructure.config.PublicUrlProperties;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import org.springframework.context.MessageSource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.mail.MailPreparationException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Component;
import org.thymeleaf.ITemplateEngine;
import org.thymeleaf.context.Context;

import java.io.UnsupportedEncodingException;
import java.net.URI;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;

@Component
public class BrandedEmails {

    public static final String LOGO_CONTENT_ID = "logo";

    private static final String LAYOUT = "email/layout";
    private static final ClassPathResource LOGO = new ClassPathResource("receipt/logo.png");
    private static final Set<String> LAYOUT_VARIABLES = Set.of("title", "contentTemplate", "footerNote", "siteUrl", "siteHost");

    private final JavaMailSender mailSender;
    private final ITemplateEngine templates;
    private final MessageSource messages;
    private final MailSenderProperties sender;
    private final PublicUrlProperties publicUrl;

    public BrandedEmails(JavaMailSender mailSender, ITemplateEngine templates, MessageSource messages, MailSenderProperties sender,
                         PublicUrlProperties publicUrl) {
        this.mailSender = mailSender;
        this.templates = templates;
        this.messages = messages;
        this.sender = sender;
        this.publicUrl = publicUrl;
    }

    public MimeMessage compose(EmailDraft draft) {
        try {
            MimeMessage email = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(email, MimeMessageHelper.MULTIPART_MODE_MIXED_RELATED, "UTF-8");
            helper.setFrom(sender.senderEmail(), messages.getMessage("email.senderName", null, draft.locale()));
            helper.setTo(draft.to().toArray(String[]::new));
            helper.setSubject(draft.subject());
            helper.setText(draft.plainText(), html(draft));
            helper.addInline(LOGO_CONTENT_ID, LOGO);
            return email;
        } catch (MessagingException | UnsupportedEncodingException e) {
            throw new MailPreparationException("The e-mail could not be composed", e);
        }
    }

    private String html(EmailDraft draft) {
        Map<String, Object> variables = new HashMap<>(draft.variables());
        variables.keySet().stream().filter(LAYOUT_VARIABLES::contains).findFirst().ifPresent(name -> {
            throw new IllegalArgumentException("The e-mail variable '" + name + "' is reserved for the layout");
        });
        URI site = URI.create(publicUrl.publicUrl());
        variables.put("title", draft.title());
        variables.put("contentTemplate", draft.contentTemplate());
        variables.put("footerNote", draft.footerNote());
        variables.put("siteUrl", site.toString());
        variables.put("siteHost", site.getHost());
        return templates.process(LAYOUT, new Context(draft.locale(), variables));
    }
}
