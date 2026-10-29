package cz.novanadeje.app.operations.application.settings;

import cz.novanadeje.app.operations.domain.settings.CarriedSettingsKey;
import cz.novanadeje.app.operations.domain.settings.CarriedSettingsKeyRepository;
import cz.novanadeje.app.operations.domain.settings.SettingsRepository;
import cz.novanadeje.app.operations.domain.settings.StoredSetting;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.Optional;

@Service
public class CarriedSettingsKeyService {

    private final SettingsRepository settings;
    private final CarriedSettingsKeyRepository carried;
    private final SecretSealer sealer;
    private final SettingsKeyCarrier carrier;
    private final Clock clock;

    public CarriedSettingsKeyService(SettingsRepository settings, CarriedSettingsKeyRepository carried, SecretSealer sealer,
                                     SettingsKeyCarrier carrier, Clock clock) {
        this.settings = settings;
        this.carried = carried;
        this.sealer = sealer;
        this.carrier = carrier;
        this.clock = clock;
    }

    @Transactional
    public int carryIntoBackups() {
        if (!carrier.available()) {
            return 0;
        }
        Optional<CarriedSettingsKey> stored = carried.find();
        int sealedAgain = stored.filter(key -> !carrier.carriesCurrentKey(key)).flatMap(carrier::sealerOf).map(this::sealAgainWith).orElse(0);
        if (stored.filter(carrier::carriesCurrentKey).isEmpty()) {
            carried.save(carrier.carryCurrentKey(clock.instant()));
        }
        return sealedAgain;
    }

    private int sealAgainWith(SecretSealer previous) {
        int sealedAgain = 0;
        for (StoredSetting stored : settings.findAll()) {
            if (!stored.sealed() || sealer.unseal(stored.setting(), stored.value()).isPresent()) {
                continue;
            }
            Optional<String> value = previous.unseal(stored.setting(), stored.value());
            if (value.isPresent()) {
                settings.save(new StoredSetting(stored.setting(), sealer.seal(stored.setting(), value.get()), true, stored.updatedAt()));
                sealedAgain++;
            }
        }
        return sealedAgain;
    }
}
