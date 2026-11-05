package cz.novanadeje.app.operations.application.push;

import cz.novanadeje.app.operations.application.settings.CarriedSettingsKeyService;
import cz.novanadeje.app.operations.application.settings.SecretSealer;
import cz.novanadeje.app.operations.domain.push.PushKey;
import cz.novanadeje.app.operations.domain.push.PushKeyRepository;
import cz.novanadeje.app.operations.domain.push.PushSubscriptionRepository;
import cz.novanadeje.app.operations.domain.push.PushUnavailable;
import cz.novanadeje.app.operations.domain.push.VapidKeys;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.Optional;

@Service
public class PushKeyService {

    private static final Logger log = LoggerFactory.getLogger(PushKeyService.class);

    private final PushKeyRepository keys;
    private final PushSubscriptionRepository subscriptions;
    private final SecretSealer sealer;
    private final PushKeyGenerator generator;
    private final CarriedSettingsKeyService carriedKeys;
    private final Clock clock;

    public PushKeyService(PushKeyRepository keys, PushSubscriptionRepository subscriptions, SecretSealer sealer, PushKeyGenerator generator,
                          CarriedSettingsKeyService carriedKeys, Clock clock) {
        this.keys = keys;
        this.subscriptions = subscriptions;
        this.sealer = sealer;
        this.generator = generator;
        this.carriedKeys = carriedKeys;
        this.clock = clock;
    }

    @Transactional
    public VapidKeys current() {
        if (!sealer.available()) {
            throw new PushUnavailable();
        }
        PushKey stored = keys.find().orElseGet(this::storeNew);
        return readable(stored).orElseGet(this::readOrReplaceLocked);
    }

    private VapidKeys readOrReplaceLocked() {
        carriedKeys.sealPushKeyAgain();
        Optional<VapidKeys> readable = keys.findLocked().flatMap(this::readable);
        if (readable.isPresent()) {
            return readable.get();
        }
        VapidKeys fresh = generator.generate();
        int removed = subscriptions.deleteAll();
        keys.replace(sealed(fresh));
        log.warn("Push keys could not be read with this server's settings key; new keys were generated and {} push subscriptions removed", removed);
        return fresh;
    }

    private Optional<VapidKeys> readable(PushKey stored) {
        return sealer.unseal(PushKey.SEAL_PURPOSE, stored.sealedPrivateKey()).map(privateKey -> new VapidKeys(stored.publicKey(), privateKey));
    }

    private PushKey storeNew() {
        keys.insertIfAbsent(sealed(generator.generate()));
        return keys.find().orElseThrow();
    }

    private PushKey sealed(VapidKeys fresh) {
        return new PushKey(fresh.publicKey(), sealer.seal(PushKey.SEAL_PURPOSE, fresh.privateKey()), clock.instant());
    }
}
