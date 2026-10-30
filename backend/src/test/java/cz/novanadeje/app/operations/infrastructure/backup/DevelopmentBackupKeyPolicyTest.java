package cz.novanadeje.app.operations.infrastructure.backup;

import cz.novanadeje.app.operations.domain.backup.BackupKey;
import cz.novanadeje.app.operations.infrastructure.settings.PublicDevelopmentKeys;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

import static org.assertj.core.api.Assertions.assertThat;

class DevelopmentBackupKeyPolicyTest {

    private static final BackupKey SERVER_KEY = new BackupKey("AGE-SECRET-KEY-1R45A984EXXAFC85YZSYGY9R6XJTD4E9AKY65ZCRGPDQ89E7ANW8QKT6GWH");

    private final BackupKey developmentKey = PublicDevelopmentKeys.ofDevelopmentProfile().backupKey()
            .orElseThrow(() -> new AssertionError("application-dev.yml has no backup key"));

    @Test
    @DisplayName("Given the prod profile, when the public development key is offered, also as its 24 words, then it is refused and another key is not")
    void should_refuse_the_development_key_when_offered_given_the_prod_profile() {
        MockEnvironment production = new MockEnvironment();
        production.setActiveProfiles("prod");
        DevelopmentBackupKeyPolicy policy = new DevelopmentBackupKeyPolicy(production);

        assertThat(policy.refuses(developmentKey)).isTrue();
        assertThat(policy.refuses(BackupKey.parse(String.join(" ", developmentKey.words())))).isTrue();
        assertThat(policy.refuses(SERVER_KEY)).isFalse();
    }

    @Test
    @DisplayName("Given the default development profile, when the public development key is offered, then nothing is refused")
    void should_refuse_nothing_when_offered_given_the_development_profile() {
        MockEnvironment development = new MockEnvironment();
        development.setDefaultProfiles("dev");
        DevelopmentBackupKeyPolicy policy = new DevelopmentBackupKeyPolicy(development);

        assertThat(policy.refuses(developmentKey)).isFalse();
        assertThat(policy.refuses(SERVER_KEY)).isFalse();
    }
}
