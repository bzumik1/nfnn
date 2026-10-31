package cz.novanadeje.app.donations.infrastructure.persistence;

final class PlantedJpaKeyDeleter {

    private final ReceiptSigningKeyJpaRepository keys;

    PlantedJpaKeyDeleter(ReceiptSigningKeyJpaRepository keys) {
        this.keys = keys;
    }

    void forget() {
        keys.deleteAll();
    }
}
