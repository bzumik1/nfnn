package cz.novanadeje.app.donations.domain.banklogo;

import cz.novanadeje.app.donations.domain.bankcode.BankCode;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface BankLogoRepository {

    List<BankLogo> findAll();

    Optional<BankLogo> find(BankCode code);

    boolean insertIfAbsent(BankLogoSource source);

    Optional<BankLogo> lockForChange(BankCode code);

    void save(BankLogo logo);

    void delete(BankCode code);

    void storeImage(StoredBankLogoImage image, byte[] webp);

    void deleteImage(BankLogoImageId id);

    Optional<byte[]> imageWebp(BankLogoImageId id);

    boolean recordUnchanged(BankLogoSource source, Instant at);

    boolean recordFailure(BankLogoSource source, BankLogoFailure failure);
}
