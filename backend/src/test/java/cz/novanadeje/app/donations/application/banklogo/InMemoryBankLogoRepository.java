package cz.novanadeje.app.donations.application.banklogo;

import cz.novanadeje.app.donations.domain.bankcode.BankCode;
import cz.novanadeje.app.donations.domain.banklogo.BankLogo;
import cz.novanadeje.app.donations.domain.banklogo.BankLogoFailure;
import cz.novanadeje.app.donations.domain.banklogo.BankLogoImageId;
import cz.novanadeje.app.donations.domain.banklogo.BankLogoRepository;
import cz.novanadeje.app.donations.domain.banklogo.BankLogoSource;
import cz.novanadeje.app.donations.domain.banklogo.StoredBankLogoImage;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;

class InMemoryBankLogoRepository implements BankLogoRepository {

    private final Map<String, BankLogo> logos = new TreeMap<>();
    private final Map<BankLogoImageId, byte[]> images = new java.util.HashMap<>();
    private final List<String> locked = new ArrayList<>();

    @Override
    public List<BankLogo> findAll() {
        return List.copyOf(logos.values());
    }

    @Override
    public Optional<BankLogo> find(BankCode code) {
        return Optional.ofNullable(logos.get(code.value()));
    }

    @Override
    public boolean insertIfAbsent(BankLogoSource source) {
        return logos.putIfAbsent(source.bank().value(), BankLogo.from(source)) == null;
    }

    @Override
    public Optional<BankLogo> lockForChange(BankCode code) {
        locked.add(code.value());
        return find(code);
    }

    @Override
    public void save(BankLogo logo) {
        if (!locked.contains(logo.code().value())) {
            throw new IllegalStateException("saved without its lock");
        }
        logos.put(logo.code().value(), logo);
    }

    @Override
    public void delete(BankCode code) {
        logos.remove(code.value());
    }

    @Override
    public void storeImage(StoredBankLogoImage image, byte[] webp) {
        images.put(image.id(), webp.clone());
    }

    @Override
    public void deleteImage(BankLogoImageId id) {
        images.remove(id);
    }

    @Override
    public Optional<byte[]> imageWebp(BankLogoImageId id) {
        return Optional.ofNullable(images.get(id));
    }

    @Override
    public boolean recordUnchanged(BankLogoSource source, Instant at) {
        return replaceIfSource(source, logos.get(source.bank().value()) == null ? null : logos.get(source.bank().value()).unchanged(at));
    }

    @Override
    public boolean recordFailure(BankLogoSource source, BankLogoFailure failure) {
        return replaceIfSource(source, logos.get(source.bank().value()) == null ? null : logos.get(source.bank().value()).failed(failure));
    }

    void put(BankLogo logo) {
        logos.put(logo.code().value(), logo);
    }

    void putImage(BankLogoImageId id, byte[] webp) {
        images.put(id, webp.clone());
    }

    Map<BankLogoImageId, byte[]> images() {
        return Map.copyOf(images);
    }

    private boolean replaceIfSource(BankLogoSource source, BankLogo changed) {
        BankLogo current = logos.get(source.bank().value());
        if (current == null || !current.source().equals(source)) {
            return false;
        }
        logos.put(source.bank().value(), changed);
        return true;
    }
}
