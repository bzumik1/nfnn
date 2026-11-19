package cz.novanadeje.app.operations.domain.settings;

import java.util.Arrays;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.function.Function;

public final class MailPasswordRouting {

    private static final List<Setting> RUNNING_SETTINGS = List.of(Setting.MAIL_HOST, Setting.MAIL_PORT, Setting.MAIL_USERNAME, Setting.MAIL_STARTTLS,
            Setting.MAIL_AUTH, Setting.MAIL_FROM);
    private static final String OFF = "false";

    private final Map<Setting, String> running;
    private final boolean passwordRuns;

    private MailPasswordRouting(Map<Setting, String> running, boolean passwordRuns) {
        this.running = running;
        this.passwordRuns = passwordRuns;
    }

    public static MailPasswordRouting readFrom(Function<Setting, Optional<String>> effectiveValue) {
        Map<Setting, String> running = new EnumMap<>(Setting.class);
        RUNNING_SETTINGS.forEach(setting -> present(effectiveValue, setting).ifPresent(value -> running.put(setting, value)));
        return new MailPasswordRouting(Map.copyOf(running), present(effectiveValue, Setting.MAIL_PASSWORD).isPresent());
    }

    public static void refuseWhenTheMailServerChangedMeanwhile(Map<Setting, String> checked, Map<Setting, String> stored, List<SettingChange> changes) {
        boolean namesTheMailServer = changes.stream().anyMatch(change -> decidesWhereMailGoes(change.setting()));
        boolean changedMeanwhile = Arrays.stream(Setting.values())
                .filter(MailPasswordRouting::decidesWhereMailGoes)
                .anyMatch(setting -> !Objects.equals(checked.get(setting), stored.get(setting)));
        if (namesTheMailServer && changedMeanwhile) {
            throw new SettingsRejected(List.of(SettingError.of(Setting.MAIL_PASSWORD, SettingProblem.MAIL_SERVER_CHANGED_MEANWHILE)));
        }
    }

    public void refuseAnotherServerWithoutItsPassword(List<SettingChange> changes, boolean passwordStored) {
        boolean passwordChanges = changes.stream().anyMatch(change -> change.setting() == Setting.MAIL_PASSWORD);
        boolean serverMoves = changes.stream()
                .filter(change -> change.setting().decidesWhereMailPasswordGoes())
                .anyMatch(change -> !sameValue(change.value(), running.get(change.setting())));
        if (serverMoves && (passwordRuns || passwordStored) && !passwordChanges) {
            throw new SettingsRejected(List.of(SettingError.of(Setting.MAIL_PASSWORD, SettingProblem.PASSWORD_FOR_NEW_MAIL_SERVER)));
        }
    }

    public boolean mayBeTestedThroughAConnection(MailServerAddress server, boolean auth, String sender, boolean passwordTyped) {
        return !passwordTyped && isTheRunningServer(server) && sameValue(String.valueOf(auth), running.getOrDefault(Setting.MAIL_AUTH, OFF))
                && sameValue(sender, running.get(Setting.MAIL_FROM));
    }

    public boolean lendsTheStoredPasswordTo(MailServerAddress server, boolean passwordTyped) {
        return !passwordTyped && isTheRunningServer(server);
    }

    private boolean isTheRunningServer(MailServerAddress server) {
        return sameValue(server.host(), running.get(Setting.MAIL_HOST))
                && sameValue(String.valueOf(server.port()), running.get(Setting.MAIL_PORT))
                && sameValue(server.username(), running.get(Setting.MAIL_USERNAME))
                && sameValue(String.valueOf(server.startTls()), running.getOrDefault(Setting.MAIL_STARTTLS, OFF));
    }

    private static boolean decidesWhereMailGoes(Setting setting) {
        return setting == Setting.MAIL_PASSWORD || setting.decidesWhereMailPasswordGoes();
    }

    private static Optional<String> present(Function<Setting, Optional<String>> effectiveValue, Setting setting) {
        return effectiveValue.apply(setting).map(String::strip).filter(stripped -> !stripped.isEmpty());
    }

    private static boolean sameValue(String given, String running) {
        String normalized = given == null || given.isBlank() ? null : given.strip();
        return normalized == null ? running == null : normalized.equalsIgnoreCase(running);
    }
}
