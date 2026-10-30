package cz.novanadeje.app.donations.infrastructure.signing;

import cz.novanadeje.app.donations.application.signing.ReceiptSigner;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.ApplicationContextInitializer;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.core.env.StandardEnvironment;

import java.util.Base64;
import java.util.HexFormat;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class ReceiptSigningPropertiesTest {

    private static final String NAME = "RECEIPT_SIGNING_KEY (app.donations.receipt.signing.key)";
    private static final String SERVER_SEED_HEX = "6e666e6e2d70726f642d746573742d736565642d6e6f742d7266632d38303332";
    private static final String SERVER_SEED = Base64.getEncoder().encodeToString(HexFormat.of().parseHex(SERVER_SEED_HEX));

    private final ApplicationContextRunner contexts = new ApplicationContextRunner()
            .withInitializer(withoutSystemEnvironment())
            .withInitializer(new ConfigDataApplicationContextInitializer())
            .withUserConfiguration(Support.class);

    @Test
    @DisplayName("Given the default dev profile without RECEIPT_SIGNING_KEY, when the context starts, then receipts are signed with the seed of RFC 8032 test 1")
    void should_use_rfc_test_seed_when_started_given_dev_profile_without_env_var() {
        contexts.run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(HexFormat.of().formatHex(context.getBean(ReceiptSigningProperties.class).seed())).isEqualTo(Rfc8032Keys.TEST_1_SEED);
            assertThat(Rfc8032Keys.TEST_1_SEED_BASE64).isEqualTo(context.getBean(ReceiptSigningProperties.class).key());
        });
    }

    @Test
    @DisplayName("Given the prod profile without RECEIPT_SIGNING_KEY, when the context starts, then it fails naming the environment variable")
    void should_fail_naming_env_var_when_started_given_prod_profile_without_env_var() {
        contexts.withPropertyValues("spring.profiles.active=prod").run(context -> {
            assertThat(context).hasFailed();
            assertThat(context.getStartupFailure()).rootCause().hasMessageContaining(NAME);
        });
    }

    @Test
    @DisplayName("Given the prod profile with RECEIPT_SIGNING_KEY, when the context starts, then receipts are signed with that seed")
    void should_use_env_var_when_started_given_prod_profile_with_env_var() {
        contexts.withPropertyValues("spring.profiles.active=prod", "RECEIPT_SIGNING_KEY=" + SERVER_SEED).run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(HexFormat.of().formatHex(context.getBean(ReceiptSigningProperties.class).seed())).isEqualTo(SERVER_SEED_HEX);
            assertThat(context.getBean(ReceiptSigner.class).keyId().value()).isEqualTo("5e00e8d0");
        });
    }

    @ParameterizedTest
    @ValueSource(strings = {Rfc8032Keys.TEST_1_SEED, Rfc8032Keys.TEST_2_SEED, Rfc8032Keys.TEST_SHA_ABC_SEED})
    @DisplayName("Given the prod profile with the seed of a public RFC 8032 test key, when the context starts, then it fails naming the environment variable without the value")
    void should_fail_naming_env_var_when_started_given_prod_profile_with_rfc_test_seed(String seedHex) {
        String seed = Base64.getEncoder().encodeToString(HexFormat.of().parseHex(seedHex));
        contexts.withPropertyValues("spring.profiles.active=prod", "RECEIPT_SIGNING_KEY=" + seed).run(context -> {
            assertThat(context).hasFailed();
            assertThat(context.getStartupFailure()).rootCause().hasMessageContaining(NAME).hasMessageContaining("RFC 8032")
                    .hasMessageNotContaining(seed.substring(0, 8)).hasMessageNotContaining(seedHex.substring(0, 8));
        });
    }

    @Test
    @DisplayName("Given the default dev profile with the seed of RFC 8032 test 2, when the context starts, then receipts are signed with that test key")
    void should_accept_rfc_test_seed_when_started_given_dev_profile() {
        String seed = Base64.getEncoder().encodeToString(HexFormat.of().parseHex(Rfc8032Keys.TEST_2_SEED));
        contexts.withPropertyValues("RECEIPT_SIGNING_KEY=" + seed).run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context.getBean(ReceiptSigner.class).keyId().value()).isEqualTo(Rfc8032Keys.TEST_2_KEY_ID);
        });
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"", "   ", "not base64 at all!", "c2hvcnQtc2VlZA=="})
    @DisplayName("Given a missing, malformed or short seed, when the properties are made, then they fail naming the environment variable without the value")
    void should_fail_naming_env_var_when_made_given_missing_malformed_or_short_seed(String key) {
        assertThatIllegalArgumentException().isThrownBy(() -> new ReceiptSigningProperties(key))
                .withMessageContaining(NAME)
                .withMessageNotContaining("c2hvcnQt");
    }

    @Test
    @DisplayName("Given the signing settings, when they are printed, then the seed does not appear")
    void should_mask_seed_when_printed_given_properties() {
        assertThat(new ReceiptSigningProperties(SERVER_SEED).toString()).doesNotContain(SERVER_SEED).doesNotContain(SERVER_SEED.substring(0, 8));
    }

    private static ApplicationContextInitializer<ConfigurableApplicationContext> withoutSystemEnvironment() {
        return context -> context.getEnvironment().getPropertySources().remove(StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME);
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(ReceiptSigningProperties.class)
    @Import(ReceiptSigningConfiguration.class)
    static class Support {
    }
}
