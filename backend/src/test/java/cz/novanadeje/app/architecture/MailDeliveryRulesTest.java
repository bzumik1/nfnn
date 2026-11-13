package cz.novanadeje.app.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaAccess;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import cz.novanadeje.app.AppApplication;
import cz.novanadeje.app.shared.infrastructure.mail.ObservedMailSender;
import jakarta.mail.Message;
import jakarta.mail.MessagingException;
import jakarta.mail.Transport;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mail.MailSender;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.JavaMailSenderImpl;

import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.Set;
import java.util.function.Consumer;

import static cz.novanadeje.app.architecture.MethodAccesses.callsOrReferences;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static org.assertj.core.api.Assertions.assertThat;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class MailDeliveryRulesTest {

    private static final String TYPED_SERVER_PROBE = "cz.novanadeje.app.operations.infrastructure.settings.JavaMailServerProbe";

    private static final DescribedPredicate<JavaAccess<?>> SENDING_MAIL = callsOrReferences("", MailSender.class, "send"::equals)
            .or(callsOrReferences("", JavaMailSenderImpl.class, "doSend"::equals))
            .or(callsOrReferences("", Transport.class, Set.of("send", "sendMessage")::contains))
            .as("a send of Spring's mail sender or of Jakarta Mail's transport");

    @ArchTest
    static final ArchRule mail_is_sent_only_through_the_observed_sender = noClasses()
            .that().doNotBelongToAnyOf(ObservedMailSender.class)
            .and().doNotHaveFullyQualifiedName(TYPED_SERVER_PROBE)
            .should().accessTargetWhere(SENDING_MAIL)
            .because("the mail alert counts every send to the running mail server, and only the test e-mail through a typed server goes elsewhere");

    @Test
    @DisplayName("Given a class that sends an e-mail through Spring's sender itself, when the mail rule checks it, then it is reported")
    void should_report_direct_send_when_rule_checks_given_class_bypassing_the_observed_sender() {
        var result = mail_is_sent_only_through_the_observed_sender.evaluate(new ClassFileImporter().importClasses(PlantedSender.class));

        assertThat(result.getFailureReport().getDetails()).isNotEmpty().allSatisfy(detail -> assertThat(detail).contains(PlantedSender.class.getSimpleName()));
    }

    @Test
    @DisplayName("Given a class that sends through a method reference to Spring's sender, when the mail rule checks it, then it is reported")
    void should_report_reference_send_when_rule_checks_given_class_bypassing_the_observed_sender() {
        var result = mail_is_sent_only_through_the_observed_sender.evaluate(new ClassFileImporter().importClasses(PlantedReferenceSender.class));

        assertThat(result.getFailureReport().getDetails()).singleElement().asString().contains(PlantedReferenceSender.class.getSimpleName());
    }

    @Test
    @DisplayName("Given the names the mail rule watches, when the mail classes are read, then each exists, so no part of the rule watches a name that is gone")
    void should_find_every_watched_name_when_read_given_the_mail_classes() {
        assertThat(Arrays.stream(MailSender.class.getMethods()).map(Method::getName)).contains("send");
        assertThat(Arrays.stream(JavaMailSenderImpl.class.getDeclaredMethods()).map(Method::getName)).contains("doSend");
        assertThat(Arrays.stream(Transport.class.getMethods()).map(Method::getName)).contains("send", "sendMessage");
    }

    @Test
    @DisplayName("Given a class that sends through Jakarta Mail's transport itself, when the mail rule checks it, then it is reported")
    void should_report_transport_send_when_rule_checks_given_class_bypassing_spring() {
        var result = mail_is_sent_only_through_the_observed_sender.evaluate(new ClassFileImporter().importClasses(PlantedTransportSender.class));

        assertThat(result.getFailureReport().getDetails()).singleElement().asString().contains("Transport.send");
    }

    static final class PlantedTransportSender {

        void send(Message message) throws MessagingException {
            Transport.send(message);
        }
    }

    static final class PlantedReferenceSender {

        Consumer<MimeMessage> send(JavaMailSender sender) {
            return sender::send;
        }
    }

    static final class PlantedSender {

        void send(JavaMailSender sender, MimeMessage message) {
            sender.send(message);
        }
    }
}
