package cz.novanadeje.app.donations.application.signing;

import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKey;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyId;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyRepository;
import cz.novanadeje.app.donations.domain.signing.ReceiptSigningKeyStatus;
import cz.novanadeje.app.shared.application.audit.AdminActionTrail;
import cz.novanadeje.app.shared.application.seal.RecordSeals;
import cz.novanadeje.app.shared.application.seal.SealVerdict;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.List;
import java.util.Optional;

@Service
@Transactional(readOnly = true)
public class ReceiptSigningKeys {

    private final ReceiptSigningKeyRepository keys;
    private final RecordSeals seals;
    private final ReceiptSigner signer;
    private final PublicTestKeyPolicy testKeys;
    private final AdminActionTrail trail;
    private final WithdrawnSeeds withdrawnSeeds;

    public ReceiptSigningKeys(ReceiptSigningKeyRepository keys, RecordSeals seals, ReceiptSigner signer, PublicTestKeyPolicy testKeys,
                              AdminActionTrail trail, WithdrawnSeeds withdrawnSeeds) {
        this.keys = keys;
        this.seals = seals;
        this.signer = signer;
        this.testKeys = testKeys;
        this.trail = trail;
        this.withdrawnSeeds = withdrawnSeeds;
    }

    public List<PublishedReceiptKey> published() {
        return listed(keys.findAll(), history()).stream().filter(PublishedReceiptKey::published).toList();
    }

    public ReceiptSigningKeysOverview overview() {
        List<ReceiptSigningKey> rows = keys.findAll();
        ReceiptSigningKeyHistory history = history();
        List<PublishedReceiptKey> all = listed(rows, history);
        boolean currentPublished = all.stream().anyMatch(key -> key.current() && key.published());
        return new ReceiptSigningKeysOverview(signer.keyId(), currentPublished, all, history.mismatches(rows));
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public Optional<ReceiptSigningKeyId> withdrawnCurrentKeyHeldForIssuing() {
        ReceiptSigningKeyId current = signer.keyId();
        boolean rowWithdrawn = keys.lockForIssuing(current).filter(ReceiptSigningKey::isWithdrawn).isPresent();
        return rowWithdrawn || history().isWithdrawn(current) ? Optional.of(current) : Optional.empty();
    }

    public boolean isCurrent(ReceiptSigningKeyId id) {
        return id.equals(signer.keyId());
    }

    public boolean publishable(ReceiptSigningKey key) {
        return !testKeys.refuses(key.id()) && key.idMatchesPublicKey()
                && seals.check(ReceiptSigningKey.SEAL_PURPOSE, key.sealedContent(), key.seal()) == SealVerdict.SEALED_HERE;
    }

    private ReceiptSigningKeyHistory history() {
        return ReceiptSigningKeyHistory.of(trail.findByActions(ReceiptSigningKeyHistory.ACTIONS), withdrawnSeeds.keyIds());
    }

    private List<PublishedReceiptKey> listed(List<ReceiptSigningKey> rows, ReceiptSigningKeyHistory history) {
        return rows.stream()
                .sorted(Comparator.comparing(ReceiptSigningKey::registeredAt).thenComparing(key -> key.id().value()))
                .map(key -> new PublishedReceiptKey(key.id(), key.publicKey(), key.registeredAt(),
                        history.isWithdrawn(key.id()) ? ReceiptSigningKeyStatus.REVOKED : key.status(), publishable(key), key.id().equals(signer.keyId())))
                .toList();
    }
}
