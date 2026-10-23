package cz.novanadeje.app.donors.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

class PasskeyChallengeTest {

    private static final Instant NOW = Instant.parse("2026-10-23T10:00:00Z");
    private static final Duration TTL = Duration.ofMinutes(5);

    @Test
    @DisplayName("Given a registration challenge, when it is checked, then only its donor may use it, within its lifetime and only once")
    void should_serve_only_its_donor_once_when_registering() {
        DonorId donor = DonorId.newId(NOW);
        LinkSecret secret = LinkSecret.generate();

        PasskeyChallenge challenge = PasskeyChallenge.forRegistration(secret, donor, NOW, TTL);

        assertThat(challenge.challengeHash()).isEqualTo(secret.hash()).doesNotContain(secret.value());
        assertThat(challenge.isUsableForRegistrationBy(donor, NOW.plus(Duration.ofMinutes(4)))).isTrue();
        assertThat(challenge.isUsableForRegistrationBy(DonorId.newId(NOW), NOW)).isFalse();
        assertThat(challenge.isUsableForSignInAt(NOW)).isFalse();
        assertThat(challenge.isUsableForRegistrationBy(donor, NOW.plus(TTL))).isFalse();
        challenge.markUsed(NOW.plusSeconds(5));
        assertThat(challenge.isUsableForRegistrationBy(donor, NOW.plusSeconds(10))).isFalse();
        assertThat(challenge.usedAt()).contains(NOW.plusSeconds(5));
    }

    @Test
    @DisplayName("Given a sign-in challenge, when it is checked, then it names no donor, serves no registration and works once within its lifetime")
    void should_serve_one_sign_in_when_issued_for_sign_in() {
        PasskeyChallenge challenge = PasskeyChallenge.forSignIn(LinkSecret.generate(), NOW, TTL);

        assertThat(challenge.donorId()).isEmpty();
        assertThat(challenge.ceremony()).isEqualTo(PasskeyCeremony.SIGN_IN);
        assertThat(challenge.isUsableForRegistrationBy(DonorId.newId(NOW), NOW)).isFalse();
        assertThat(challenge.isUsableForSignInAt(NOW.plus(TTL).minusMillis(1))).isTrue();
        assertThat(challenge.isUsableForSignInAt(NOW.plus(TTL))).isFalse();
        challenge.markUsed(NOW);
        assertThat(challenge.isUsableForSignInAt(NOW)).isFalse();
    }
}
