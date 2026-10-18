package cz.novanadeje.app.donations.infrastructure.pdf;

import cz.novanadeje.app.donations.domain.BankAccount;
import cz.novanadeje.app.donations.domain.receipt.FoundationIdentity;
import cz.novanadeje.app.donations.domain.receipt.Signatory;
import cz.novanadeje.app.shared.domain.Iban;
import cz.novanadeje.app.shared.domain.PostalAddress;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

class ReceiptPropertiesTest {

    private final ApplicationContextRunner contexts = new ApplicationContextRunner()
            .withInitializer(new ConfigDataApplicationContextInitializer())
            .withUserConfiguration(Support.class);

    @Test
    @DisplayName("Given only application.yml, when the context starts, then the foundation, the signatory and no signature image come from the defaults")
    void should_use_defaults_when_started_given_no_overrides() {
        contexts.run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context.getBean(FoundationIdentity.class)).isEqualTo(new FoundationIdentity("Nová naděje - nadační fond", "27278794",
                    new PostalAddress("Jiráskova 436", "Nový Bor", "473 01"), "Krajský soud v Ústí nad Labem", "N 78", "5544332217/2010",
                    "V Novém Boru", "Nový Bor"));
            assertThat(context.getBean(Signatory.class)).isEqualTo(new Signatory("Pavel Znamenáček", "předseda správní rady"));
            assertThat(context.getBean(ConfiguredSignatureImage.class).image()).isEmpty();
            assertThat(context.getBean(ReceiptProperties.class).signatureImagePath()).isEmpty();
        });
    }

    @Test
    @DisplayName("Given a company identifier that is not eight digits, when the context starts, then it fails naming the property")
    void should_fail_naming_property_when_started_given_company_identifier_of_seven_digits() {
        contexts.withPropertyValues("app.donations.receipt.foundation-company-identifier=2727879").run(context -> {
            assertThat(context).hasFailed();
            assertThat(context.getStartupFailure()).rootCause()
                    .hasMessageContaining("app.donations.receipt.foundation-company-identifier")
                    .hasMessageContaining("2727879");
        });
    }

    @Test
    @DisplayName("Given an empty signatory name, when the context starts, then it fails naming the environment variable")
    void should_fail_naming_env_var_when_started_given_empty_signatory_name() {
        contexts.withPropertyValues("app.donations.receipt.signatory-name=").run(context -> {
            assertThat(context).hasFailed();
            assertThat(context.getStartupFailure()).rootCause().hasMessageContaining("RECEIPT_SIGNATORY_NAME");
        });
    }

    @Test
    @DisplayName("Given a signature image path to a missing file, when the context starts, then it fails naming the environment variable and the path")
    void should_fail_when_started_given_missing_signature_file(@TempDir Path folder) {
        Path missing = folder.resolve("signature.png");

        contexts.withPropertyValues("app.donations.receipt.signature-image=" + missing).run(context -> {
            assertThat(context).hasFailed();
            assertThat(context.getStartupFailure()).hasStackTraceContaining("RECEIPT_SIGNATURE_IMAGE points to " + missing);
        });
    }

    @Test
    @DisplayName("Given a signature image that is neither PNG nor JPEG, when the context starts, then it fails")
    void should_fail_when_started_given_signature_of_other_type(@TempDir Path folder) throws IOException {
        Path gif = Files.write(folder.resolve("signature.gif"), new byte[]{'G', 'I', 'F'});

        contexts.withPropertyValues("app.donations.receipt.signature-image=" + gif).run(context -> {
            assertThat(context).hasFailed();
            assertThat(context.getStartupFailure()).rootCause().hasMessageContaining("PNG or JPEG");
        });
    }

    @Test
    @DisplayName("Given PNG and JPEG signature files, when the context starts, then each is read once with its media type")
    void should_read_signature_with_media_type_when_started_given_png_or_jpeg(@TempDir Path folder) throws IOException {
        byte[] bytes = {1, 2, 3};
        Path png = Files.write(folder.resolve("podpis.PNG"), bytes);
        Path jpeg = Files.write(folder.resolve("podpis.jpg"), bytes);

        contexts.withPropertyValues("app.donations.receipt.signature-image=" + png).run(context ->
                assertThat(context.getBean(ConfiguredSignatureImage.class).image()).hasValueSatisfying(image -> {
                    assertThat(image.bytes()).isEqualTo(bytes);
                    assertThat(image.mediaType()).isEqualTo("image/png");
                    assertThat(image.dataUri()).isEqualTo("data:image/png;base64,AQID");
                }));
        contexts.withPropertyValues("app.donations.receipt.signature-image=" + jpeg).run(context ->
                assertThat(context.getBean(ConfiguredSignatureImage.class).image()).hasValueSatisfying(image ->
                        assertThat(image.mediaType()).isEqualTo("image/jpeg")));
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(ReceiptProperties.class)
    @Import(ReceiptConfiguration.class)
    static class Support {

        @Bean
        BankAccount foundationBankAccount() {
            return new BankAccount("5544332217/2010", new Iban("CZ2620100000005544332217"), "Nadační fond Nová naděje");
        }
    }
}
