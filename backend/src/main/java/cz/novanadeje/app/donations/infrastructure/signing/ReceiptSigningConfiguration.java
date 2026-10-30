package cz.novanadeje.app.donations.infrastructure.signing;

import cz.novanadeje.app.donations.application.signing.ReceiptSigner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
class ReceiptSigningConfiguration {

    @Bean
    ReceiptSigner receiptSigner(ReceiptSigningProperties properties) {
        return Ed25519ReceiptSigner.fromSeed(properties.seed());
    }
}
