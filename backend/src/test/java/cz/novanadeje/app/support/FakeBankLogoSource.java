package cz.novanadeje.app.support;

import cz.novanadeje.app.donations.application.banklogo.BankLogoImages;
import cz.novanadeje.app.donations.application.banklogo.BankLogoUnavailable;
import cz.novanadeje.app.donations.application.banklogo.FetchedBankLogo;
import cz.novanadeje.app.donations.domain.banklogo.BankLogoFailure;
import cz.novanadeje.app.donations.domain.banklogo.BankLogoSource;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

public class FakeBankLogoSource implements BankLogoImages {

    private final Map<String, byte[]> pictures = new ConcurrentHashMap<>();
    private final Map<String, BankLogoFailure> failures = new ConcurrentHashMap<>();
    private final List<String> asked = new CopyOnWriteArrayList<>();

    @Override
    public FetchedBankLogo fetch(BankLogoSource source) {
        asked.add(source.url());
        BankLogoFailure failure = failures.get(source.url());
        if (failure != null) {
            throw new BankLogoUnavailable(failure);
        }
        byte[] picture = pictures.get(source.url());
        if (picture == null) {
            throw new BankLogoUnavailable(BankLogoFailure.STATUS);
        }
        return FetchedBankLogo.of(picture);
    }

    public static byte[] webpOf(String picture) {
        return ("RIFF\0\0\0\0WEBP" + picture).getBytes(StandardCharsets.UTF_8);
    }

    public void serve(String url, String picture) {
        failures.remove(url);
        pictures.put(url, webpOf(picture));
    }

    public void failWith(String url, BankLogoFailure failure) {
        failures.put(url, failure);
    }

    public List<String> asked() {
        return List.copyOf(asked);
    }

    public void reset() {
        pictures.clear();
        failures.clear();
        asked.clear();
    }
}
