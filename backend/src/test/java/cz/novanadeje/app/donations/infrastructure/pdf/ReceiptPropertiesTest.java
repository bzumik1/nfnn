package cz.novanadeje.app.donations.infrastructure.pdf;

import cz.novanadeje.app.donations.domain.BankAccount;
import cz.novanadeje.app.donations.domain.receipt.FirstReceiptYear;
import cz.novanadeje.app.donations.domain.receipt.FoundationIdentity;
import cz.novanadeje.app.donations.domain.receipt.Signatory;
import cz.novanadeje.app.shared.domain.Iban;
import cz.novanadeje.app.shared.domain.PostalAddress;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;

import java.time.Year;

import static org.assertj.core.api.Assertions.assertThat;

class ReceiptPropertiesTest {

    private final ApplicationContextRunner contexts = new ApplicationContextRunner()
            .withInitializer(new ConfigDataApplicationContextInitializer())
            .withUserConfiguration(Support.class);

    @Test
    @DisplayName("Given only application.yml, when the context starts, then the foundation, and the signatory come from the defaults")
    void should_use_defaults_when_started_given_no_overrides() {
        contexts.run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context.getBean(FoundationIdentity.class)).isEqualTo(new FoundationIdentity("Nová naděje - nadační fond", "27278794",
                    new PostalAddress("Jiráskova 436", "Nový Bor", "473 01"), "Krajský soud v Ústí nad Labem", "N 78", "5544332217/2010",
                    "V Novém Boru", "Nový Bor"));
            assertThat(context.getBean(Signatory.class)).isEqualTo(new Signatory("Pavel Znamenáček", "předseda správní rady"));
        });
    }

    @Test
    @DisplayName("Given only application.yml, when the context starts, then receipts are issued for donations from 2026")
    void should_issue_receipts_from_2026_when_started_given_no_first_year() {
        contexts.run(context -> assertThat(context.getBean(FirstReceiptYear.class)).isEqualTo(new FirstReceiptYear(Year.of(2026))));
    }

    @Test
    @DisplayName("Given another first receipt year, when the context starts, then receipts are issued from that year")
    void should_issue_receipts_from_configured_year_when_started_given_first_year() {
        contexts.withPropertyValues("app.donations.receipt.first-year=2025").run(context ->
                assertThat(context.getBean(FirstReceiptYear.class)).isEqualTo(new FirstReceiptYear(Year.of(2025))));
    }

    @Test
    @DisplayName("Given an empty first receipt year, when the context starts, then receipts are issued from 2026")
    void should_issue_receipts_from_2026_when_started_given_empty_first_year() {
        contexts.withPropertyValues("app.donations.receipt.first-year=").run(context ->
                assertThat(context.getBean(FirstReceiptYear.class)).isEqualTo(new FirstReceiptYear(Year.of(2026))));
    }

    @ParameterizedTest
    @ValueSource(strings = {"999", "10000", "0", "-2026"})
    @DisplayName("Given a first receipt year that is not a four-digit year, when the context starts, then it fails naming the environment variable")
    void should_fail_naming_env_var_when_started_given_first_year_out_of_range(String year) {
        contexts.withPropertyValues("app.donations.receipt.first-year=" + year).run(context -> {
            assertThat(context).hasFailed();
            assertThat(context.getStartupFailure()).rootCause()
                    .hasMessageContaining("RECEIPT_FIRST_YEAR (app.donations.receipt.first-year) must be a four-digit year")
                    .hasMessageContaining(year);
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

    @ParameterizedTest
    @ValueSource(strings = {"foundation-name", "foundation-street", "foundation-city", "registry-court",
            "registry-file", "issue-place", "issue-place-en", "signatory-name", "signatory-role"})
    @DisplayName("Given a printed receipt value with a character the receipt fonts cannot print, when the context starts, then it fails naming the property and the code point")
    void should_fail_naming_property_when_started_given_unprintable_printed_value(String property) {
        contexts.withPropertyValues("app.donations.receipt." + property + "=Nov\u00e1 \ud83d\ude00").run(context -> {
            assertThat(context).hasFailed();
            assertThat(context.getStartupFailure()).rootCause()
                    .hasMessageContaining("app.donations.receipt." + property)
                    .hasMessageContaining("U+1F600");
        });
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
