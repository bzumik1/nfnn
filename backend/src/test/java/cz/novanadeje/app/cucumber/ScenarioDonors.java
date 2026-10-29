package cz.novanadeje.app.cucumber;

import cz.novanadeje.app.shared.domain.VariableSymbol;
import io.cucumber.spring.ScenarioScope;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
@ScenarioScope
public class ScenarioDonors {

    private static final Pattern ALIAS_PLACEHOLDER = Pattern.compile("\\{([^{}]+)}");

    private final Map<String, RememberedDonor> donors = new HashMap<>();
    private final Map<String, String> accessTokens = new HashMap<>();
    private final Map<String, Credentials> credentials = new HashMap<>();
    private final Map<String, String> secondFactorSecrets = new HashMap<>();

    public void remember(String alias, UUID donorId, VariableSymbol variableSymbol) {
        donors.put(alias, new RememberedDonor(donorId, variableSymbol));
    }

    public void rememberAccessToken(String alias, String accessToken) {
        accessTokens.put(alias, accessToken);
    }

    public void rememberCredentials(String alias, String email, String password) {
        credentials.put(alias, new Credentials(email, password));
    }

    public void rememberSecondFactorSecret(String alias, String secret) {
        secondFactorSecrets.put(alias, secret);
    }

    public boolean hasSecondFactor(String alias) {
        return secondFactorSecrets.containsKey(alias);
    }

    public String secondFactorSecretOf(String alias) {
        String secret = secondFactorSecrets.get(alias);
        if (secret == null) {
            throw new IllegalArgumentException("No second factor for \"" + alias + "\" in this scenario; known: " + secondFactorSecrets.keySet());
        }
        return secret;
    }

    public Credentials credentialsOf(String alias) {
        Credentials remembered = credentials.get(alias);
        if (remembered == null) {
            throw new IllegalArgumentException("No credentials for \"" + alias + "\" in this scenario; known: " + credentials.keySet());
        }
        return remembered;
    }

    public String accessTokenOf(String alias) {
        String accessToken = accessTokens.get(alias);
        if (accessToken == null) {
            throw new IllegalArgumentException("No access token for \"" + alias + "\" in this scenario; known: " + accessTokens.keySet());
        }
        return accessToken;
    }

    public Optional<UUID> findIdOf(String alias) {
        return Optional.ofNullable(donors.get(alias)).map(RememberedDonor::donorId);
    }

    public UUID idOf(String alias) {
        return donor(alias).donorId();
    }

    public VariableSymbol variableSymbolOf(String alias) {
        return donor(alias).variableSymbol();
    }

    public Map<String, String> variableSymbolsByAlias() {
        Map<String, String> symbols = new HashMap<>();
        donors.forEach((alias, donor) -> symbols.put(alias, donor.variableSymbol().value()));
        return symbols;
    }

    public Collection<String> secondFactorSecrets() {
        return List.copyOf(secondFactorSecrets.values());
    }

    public String resolve(String cell) {
        if (cell == null) {
            return null;
        }
        Matcher placeholder = ALIAS_PLACEHOLDER.matcher(cell);
        return placeholder.replaceAll(match -> Matcher.quoteReplacement(variableSymbolOf(match.group(1)).value()));
    }

    private RememberedDonor donor(String alias) {
        RememberedDonor donor = donors.get(alias);
        if (donor == null) {
            throw new IllegalArgumentException("No donor \"" + alias + "\" in this scenario; known: " + donors.keySet());
        }
        return donor;
    }

    public record Credentials(String email, String password) {
    }

    private record RememberedDonor(UUID donorId, VariableSymbol variableSymbol) {
    }
}
