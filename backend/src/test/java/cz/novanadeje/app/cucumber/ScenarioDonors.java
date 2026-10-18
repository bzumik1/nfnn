package cz.novanadeje.app.cucumber;

import cz.novanadeje.app.shared.domain.VariableSymbol;
import io.cucumber.spring.ScenarioScope;
import org.springframework.stereotype.Component;

import java.util.HashMap;
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

    public void remember(String alias, UUID donorId, VariableSymbol variableSymbol) {
        donors.put(alias, new RememberedDonor(donorId, variableSymbol));
    }

    public void rememberAccessToken(String alias, String accessToken) {
        accessTokens.put(alias, accessToken);
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

    private record RememberedDonor(UUID donorId, VariableSymbol variableSymbol) {
    }
}
