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
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mail.MailSender;
import org.springframework.mail.javamail.JavaMailSender;

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

    private static final DescribedPredicate<JavaAccess<?>> SENDING_MAIL = callsOrReferences("a send of Spring's mail sender", MailSender.class, "send"::equals);

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
