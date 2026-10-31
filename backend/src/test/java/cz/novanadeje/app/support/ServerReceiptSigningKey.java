package cz.novanadeje.app.support;

import cz.novanadeje.app.donations.application.signing.ReceiptSigner;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKey;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyRepository;
import cz.novanadeje.app.shared.application.seal.RecordSeals;
import org.springframework.context.ApplicationContext;

import java.time.Clock;

public final class ServerReceiptSigningKey {

    private ServerReceiptSigningKey() {
    }

    public static void storeAfterEmptyTables(ApplicationContext context) {
        ReceiptSigner signer = context.getBean(ReceiptSigner.class);
        RecordSeals seals = context.getBean(RecordSeals.class);
        context.getBean(ReceiptSigningKeyRepository.class).save(ReceiptSigningKey.register(signer.publicKey(), context.getBean(Clock.class).instant(),
                content -> seals.seal(ReceiptSigningKey.SEAL_PURPOSE, content)));
    }
}
