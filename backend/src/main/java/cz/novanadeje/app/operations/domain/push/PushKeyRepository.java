package cz.novanadeje.app.operations.domain.push;

import java.util.Optional;

public interface PushKeyRepository {

    Optional<PushKey> find();

    Optional<PushKey> findLocked();

    void insertIfAbsent(PushKey key);

    void replace(PushKey key);
}
