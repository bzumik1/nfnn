package cz.novanadeje.app.donations.infrastructure.bank;

import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import cz.novanadeje.app.donations.domain.donor.ExcludedSenderAccounts;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;
import java.util.stream.Collectors;

@ConfigurationProperties("app.donations.pairing")
public record PairingProperties(List<String> excludedAccounts) {

    public PairingProperties {
        excludedAccounts = excludedAccounts == null ? List.of() : List.copyOf(excludedAccounts);
        excludedAccounts.stream().filter(entry -> !entry.isBlank()).forEach(PairingProperties::parse);
    }

    ExcludedSenderAccounts toExcludedSenderAccounts() {
        return new ExcludedSenderAccounts(excludedAccounts.stream()
                .filter(entry -> !entry.isBlank())
                .map(PairingProperties::parse)
                .collect(Collectors.toUnmodifiableSet()));
    }

    private static SenderAccount parse(String entry) {
        String[] parts = entry.trim().split("/", -1);
        if (parts.length != 2) {
            throw new IllegalArgumentException("app.donations.pairing.excluded-accounts holds a Czech account as number/bank code: " + entry);
        }
        return SenderAccount.parse(parts[0], parts[1]).orElseThrow(() -> new IllegalArgumentException(
                "app.donations.pairing.excluded-accounts holds a Czech account as number/bank code: " + entry));
    }
}
