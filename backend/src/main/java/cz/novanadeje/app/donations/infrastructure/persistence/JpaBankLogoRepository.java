package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.bankcode.BankCode;
import cz.novanadeje.app.donations.domain.banklogo.BankLogo;
import cz.novanadeje.app.donations.domain.banklogo.BankLogoFailure;
import cz.novanadeje.app.donations.domain.banklogo.BankLogoImageId;
import cz.novanadeje.app.donations.domain.banklogo.BankLogoRepository;
import cz.novanadeje.app.donations.domain.banklogo.BankLogoSource;
import cz.novanadeje.app.donations.domain.banklogo.StoredBankLogoImage;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
class JpaBankLogoRepository implements BankLogoRepository {

    private final BankLogoJpaRepository logos;
    private final BankLogoImageJpaRepository images;

    JpaBankLogoRepository(BankLogoJpaRepository logos, BankLogoImageJpaRepository images) {
        this.logos = logos;
        this.images = images;
    }

    @Override
    public List<BankLogo> findAll() {
        return logos.findAllRows().stream().map(BankLogoRow::toDomain).toList();
    }

    @Override
    public Optional<BankLogo> find(BankCode code) {
        return logos.findRow(code.value()).map(BankLogoRow::toDomain);
    }

    @Override
    public boolean insertIfAbsent(BankLogoSource source) {
        return logos.insertIgnoringExisting(source.bank().value(), source.url()) == 1;
    }

    @Override
    public Optional<BankLogo> lockForChange(BankCode code) {
        return logos.findLockedByCode(code.value())
                .map(entity -> entity.toRow(Optional.ofNullable(entity.imageId()).flatMap(images::findSha256).orElse(null)).toDomain());
    }

    @Override
    public void save(BankLogo logo) {
        BankLogoJpaEntity entity = logos.findById(logo.code().value())
                .orElseThrow(() -> new IllegalStateException("A bank logo is saved only after its row was locked"));
        entity.apply(logo);
        logos.flush();
    }

    @Override
    public void delete(BankCode code) {
        logos.deleteById(code.value());
        logos.flush();
    }

    @Override
    public void storeImage(StoredBankLogoImage image, byte[] webp) {
        images.saveAndFlush(BankLogoImageJpaEntity.of(image.id().value(), image.sha256(), webp));
    }

    @Override
    public void deleteImage(BankLogoImageId id) {
        images.deleteImage(id.value());
    }

    @Override
    public Optional<byte[]> imageWebp(BankLogoImageId id) {
        return images.findWebp(id.value());
    }

    @Override
    public boolean recordUnchanged(BankLogoSource source, Instant at) {
        return logos.markChecked(source.bank().value(), source.url(), at) == 1;
    }

    @Override
    public boolean recordFailure(BankLogoSource source, BankLogoFailure failure) {
        return logos.markFailed(source.bank().value(), source.url(), failure.word()) == 1;
    }
}
