package cz.novanadeje.app.donations.infrastructure.signing;

import cz.novanadeje.app.donations.application.signing.PublicTestKeyPolicy;
import cz.novanadeje.app.donations.application.signing.ReceiptSigner;
import cz.novanadeje.app.donations.application.signing.WithdrawnSeeds;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyId;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;

import java.util.Set;

@Configuration(proxyBeanMethods = false)
class ReceiptSigningConfiguration {

    private static final Profiles DEVELOPMENT = Profiles.of("dev");

    @Bean
    PublicTestKeyPolicy publicTestKeyPolicy(Environment environment) {
        boolean development = environment.acceptsProfiles(DEVELOPMENT);
        return id -> !development && id.isPublicTestKey();
    }

    @Bean
    WithdrawnSeeds withdrawnSeeds(ReceiptSigningProperties properties) {
        Set<ReceiptSigningKeyId> keyIds = properties.withdrawnKeys();
        return () -> keyIds;
    }

    @Bean
    ReceiptSigner receiptSigner(ReceiptSigningProperties properties, PublicTestKeyPolicy testKeys) {
        Ed25519ReceiptSigner signer = Ed25519ReceiptSigner.fromSeed(properties.seed());
        if (testKeys.refuses(signer.keyId())) {
            throw new IllegalStateException(ReceiptSigningProperties.VARIABLE
                    + " holds a public test seed of RFC 8032, which anyone can sign with; outside development the server signs only with a seed of its own");
        }
        return signer;
    }
}
