package cz.novanadeje.app.donations.application.signing;

import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKey;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyRepository;
import cz.novanadeje.app.shared.application.seal.RecordSeals;
import cz.novanadeje.app.shared.application.seal.SealVerdict;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.List;

@Service
@Transactional(readOnly = true)
public class ReceiptSigningKeys {

    private final ReceiptSigningKeyRepository keys;
    private final RecordSeals seals;
    private final ReceiptSigner signer;
    private final PublicTestKeyPolicy testKeys;

    public ReceiptSigningKeys(ReceiptSigningKeyRepository keys, RecordSeals seals, ReceiptSigner signer, PublicTestKeyPolicy testKeys) {
        this.keys = keys;
        this.seals = seals;
        this.signer = signer;
        this.testKeys = testKeys;
    }

    public List<PublishedReceiptKey> published() {
        return all().stream().filter(PublishedReceiptKey::published).toList();
    }

    public ReceiptSigningKeysOverview overview() {
        List<PublishedReceiptKey> all = all();
        boolean currentPublished = all.stream().anyMatch(key -> key.current() && key.published());
        return new ReceiptSigningKeysOverview(signer.keyId(), currentPublished, all);
    }

    private List<PublishedReceiptKey> all() {
        return keys.findAll().stream()
                .sorted(Comparator.comparing(ReceiptSigningKey::registeredAt).thenComparing(key -> key.id().value()))
                .map(key -> new PublishedReceiptKey(key.id(), key.publicKey(), key.registeredAt(), key.status(),
                        !testKeys.refuses(key.id()) && key.idMatchesPublicKey() && seals.check(ReceiptSigningKey.SEAL_PURPOSE, key.sealedContent(), key.seal()) == SealVerdict.SEALED_HERE,
                        key.id().equals(signer.keyId())))
                .toList();
    }
}
