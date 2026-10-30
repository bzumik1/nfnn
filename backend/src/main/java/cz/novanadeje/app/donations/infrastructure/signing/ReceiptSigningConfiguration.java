package cz.novanadeje.app.donations.infrastructure.signing;

import cz.novanadeje.app.donations.application.signing.PublicTestKeyPolicy;
import cz.novanadeje.app.donations.application.signing.ReceiptSigner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;

import java.util.Set;

@Configuration(proxyBeanMethods = false)
class ReceiptSigningConfiguration {

    static final Set<String> PUBLIC_TEST_KEY_IDS = Set.of("21fe31df", "39f713d0", "5f9b247e");
    private static final Profiles DEVELOPMENT = Profiles.of("dev");

    @Bean
    PublicTestKeyPolicy publicTestKeyPolicy() {
        return id -> false;
    }

    @Bean
    ReceiptSigner receiptSigner(ReceiptSigningProperties properties, Environment environment) {
        Ed25519ReceiptSigner signer = Ed25519ReceiptSigner.fromSeed(properties.seed());
        if (PUBLIC_TEST_KEY_IDS.contains(signer.keyId().value()) && !environment.acceptsProfiles(DEVELOPMENT)) {
            throw new IllegalStateException(ReceiptSigningProperties.VARIABLE
                    + " holds a public test seed of RFC 8032, which anyone can sign with; outside development the server signs only with a seed of its own");
        }
        return signer;
    }
}
