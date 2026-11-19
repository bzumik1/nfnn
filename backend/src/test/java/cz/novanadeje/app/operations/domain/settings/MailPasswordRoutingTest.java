package cz.novanadeje.app.operations.domain.settings;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatNoException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class MailPasswordRoutingTest {

    private static final MailServerAddress RUNNING_SERVER = new MailServerAddress("smtp.example.cz", 587, "nadace@example.cz", true);
    private static final String RUNNING_SENDER = "info@example.cz";

    private static Map<Setting, String> runningSettings() {
        Map<Setting, String> values = new EnumMap<>(Setting.class);
        values.put(Setting.MAIL_HOST, "smtp.example.cz");
        values.put(Setting.MAIL_PORT, "587");
        values.put(Setting.MAIL_USERNAME, "nadace@example.cz");
        values.put(Setting.MAIL_STARTTLS, "true");
        values.put(Setting.MAIL_AUTH, "true");
        values.put(Setting.MAIL_FROM, RUNNING_SENDER);
        values.put(Setting.MAIL_PASSWORD, "heslo-k-posta");
        return values;
    }

    private static MailPasswordRouting routing(Map<Setting, String> running) {
        return MailPasswordRouting.readFrom(setting -> Optional.ofNullable(running.get(setting)));
    }

    private static MailPasswordRouting runningWithItsPassword() {
        return routing(runningSettings());
    }

    @Nested
    @DisplayName("Given the mail settings read before the lock")
    class GivenTheSettingsReadBeforeTheLock {

        private final Map<Setting, String> checked = Map.of(Setting.MAIL_HOST, "smtp.example.cz", Setting.MAIL_PASSWORD, "sealed");

        @Test
        @DisplayName("when a change names the mail server and the server changed meanwhile, then it is refused as changed meanwhile")
        void should_refuse_when_checked_given_the_server_changed_meanwhile() {
            Map<Setting, String> stored = Map.of(Setting.MAIL_HOST, "smtp.jinde.cz", Setting.MAIL_PASSWORD, "sealed");

            assertThatThrownBy(() -> MailPasswordRouting.refuseWhenTheMailServerChangedMeanwhile(checked, stored,
                    List.of(new SettingChange(Setting.MAIL_PASSWORD, "nove"))))
                    .isInstanceOfSatisfying(SettingsRejected.class, refused -> assertThat(refused.errors())
                            .containsExactly(SettingError.of(Setting.MAIL_PASSWORD, SettingProblem.MAIL_SERVER_CHANGED_MEANWHILE)));
        }

        @Test
        @DisplayName("when a change names the mail server and only its password changed meanwhile, then it is refused as changed meanwhile")
        void should_refuse_when_checked_given_the_password_changed_meanwhile() {
            Map<Setting, String> stored = Map.of(Setting.MAIL_HOST, "smtp.example.cz", Setting.MAIL_PASSWORD, "resealed");

            assertThatThrownBy(() -> MailPasswordRouting.refuseWhenTheMailServerChangedMeanwhile(checked, stored,
                    List.of(new SettingChange(Setting.MAIL_PORT, "465"))))
                    .isInstanceOfSatisfying(SettingsRejected.class, refused -> assertThat(refused.errors())
                            .containsExactly(SettingError.of(Setting.MAIL_PASSWORD, SettingProblem.MAIL_SERVER_CHANGED_MEANWHILE)));
        }

        @Test
        @DisplayName("when a change names the mail server and a password was stored only after the read, then it is refused as changed meanwhile")
        void should_refuse_when_checked_given_a_password_stored_after_the_read() {
            Map<Setting, String> checkedWithoutPassword = Map.of(Setting.MAIL_HOST, "smtp.example.cz");
            Map<Setting, String> storedWithPassword = Map.of(Setting.MAIL_HOST, "smtp.example.cz", Setting.MAIL_PASSWORD, "sealed");

            assertThatThrownBy(() -> MailPasswordRouting.refuseWhenTheMailServerChangedMeanwhile(checkedWithoutPassword, storedWithPassword,
                    List.of(new SettingChange(Setting.MAIL_HOST, "smtp.example.cz"))))
                    .isInstanceOfSatisfying(SettingsRejected.class, refused -> assertThat(refused.errors())
                            .containsExactly(SettingError.of(Setting.MAIL_PASSWORD, SettingProblem.MAIL_SERVER_CHANGED_MEANWHILE)));
        }

        @Test
        @DisplayName("when a change names the mail server and nothing of it changed, or a change names no part of it, then it passes")
        void should_pass_when_checked_given_an_unchanged_server_or_a_change_elsewhere() {
            Map<Setting, String> moved = Map.of(Setting.MAIL_HOST, "smtp.jinde.cz", Setting.MAIL_PASSWORD, "sealed");

            assertThatNoException().isThrownBy(() -> MailPasswordRouting.refuseWhenTheMailServerChangedMeanwhile(checked, checked,
                    List.of(new SettingChange(Setting.MAIL_HOST, "smtp.example.cz"))));
            assertThatNoException().isThrownBy(() -> MailPasswordRouting.refuseWhenTheMailServerChangedMeanwhile(checked, moved,
                    List.of(new SettingChange(Setting.MAIL_FROM, "jine@example.cz"))));
        }
    }

    @Nested
    @DisplayName("Given a running mail server with its password")
    class GivenARunningServerWithItsPassword {

        @Test
        @DisplayName("when a change moves the host, port, user or STARTTLS without a password, then it is refused as a password for the new server")
        void should_refuse_when_moved_given_no_password_in_the_change() {
            for (SettingChange move : List.of(new SettingChange(Setting.MAIL_HOST, "smtp.jinde.cz"), new SettingChange(Setting.MAIL_PORT, "465"),
                    new SettingChange(Setting.MAIL_USERNAME, "jiny@example.cz"), new SettingChange(Setting.MAIL_STARTTLS, "false"))) {
                assertThatThrownBy(() -> runningWithItsPassword().refuseAnotherServerWithoutItsPassword(List.of(move), false))
                        .isInstanceOfSatisfying(SettingsRejected.class, refused -> assertThat(refused.errors())
                                .containsExactly(SettingError.of(Setting.MAIL_PASSWORD, SettingProblem.PASSWORD_FOR_NEW_MAIL_SERVER)));
            }
        }

        @Test
        @DisplayName("when a change moves the server and brings a password, then it passes")
        void should_pass_when_moved_given_a_password_in_the_change() {
            assertThatNoException().isThrownBy(() -> runningWithItsPassword().refuseAnotherServerWithoutItsPassword(List.of(
                    new SettingChange(Setting.MAIL_HOST, "smtp.jinde.cz"), new SettingChange(Setting.MAIL_PASSWORD, "nove")), true));
        }

        @Test
        @DisplayName("when a change names the server's own values in another case or with spaces, or changes only the sender, then it moves nothing and passes")
        void should_pass_when_changed_given_the_same_server() {
            assertThatNoException().isThrownBy(() -> runningWithItsPassword().refuseAnotherServerWithoutItsPassword(List.of(
                    new SettingChange(Setting.MAIL_HOST, " SMTP.Example.CZ "), new SettingChange(Setting.MAIL_STARTTLS, "TRUE"),
                    new SettingChange(Setting.MAIL_FROM, "jine@example.cz")), true));
        }

        @Test
        @DisplayName("when a change resets the host to its default, then the server moves and it is refused without a password")
        void should_refuse_when_reset_given_no_password_in_the_change() {
            assertThatThrownBy(() -> runningWithItsPassword().refuseAnotherServerWithoutItsPassword(List.of(new SettingChange(Setting.MAIL_HOST, null)), false))
                    .isInstanceOfSatisfying(SettingsRejected.class, refused -> assertThat(refused.errors())
                            .containsExactly(SettingError.of(Setting.MAIL_PASSWORD, SettingProblem.PASSWORD_FOR_NEW_MAIL_SERVER)));
        }

        @Test
        @DisplayName("when a test e-mail names the running server, sign-in and sender with no password typed, then a connection may send it and the stored password is lent")
        void should_allow_a_connection_and_lend_the_password_when_tested_given_the_running_server() {
            MailPasswordRouting routing = runningWithItsPassword();

            assertThat(routing.mayBeTestedThroughAConnection(RUNNING_SERVER, true, RUNNING_SENDER, false)).isTrue();
            assertThat(routing.lendsTheStoredPasswordTo(RUNNING_SERVER, false)).isTrue();
            assertThat(routing.lendsTheStoredPasswordTo(new MailServerAddress(" SMTP.EXAMPLE.cz", 587, "Nadace@Example.cz", true), false)).isTrue();
        }

        @Test
        @DisplayName("when a test e-mail names another host, port, user or STARTTLS, then a connection may not send it and no stored password is lent")
        void should_refuse_a_connection_and_lend_nothing_when_tested_given_another_server() {
            MailPasswordRouting routing = runningWithItsPassword();
            for (MailServerAddress other : List.of(new MailServerAddress("smtp.jinde.cz", 587, "nadace@example.cz", true),
                    new MailServerAddress("smtp.example.cz", 465, "nadace@example.cz", true),
                    new MailServerAddress("smtp.example.cz", 587, "jiny@example.cz", true),
                    new MailServerAddress("smtp.example.cz", 587, "nadace@example.cz", false))) {
                assertThat(routing.mayBeTestedThroughAConnection(other, true, RUNNING_SENDER, false)).isFalse();
                assertThat(routing.lendsTheStoredPasswordTo(other, false)).isFalse();
            }
        }

        @Test
        @DisplayName("when a test e-mail of the running server signs in otherwise, comes from another sender or has a typed password, then a connection may not send it")
        void should_refuse_a_connection_when_tested_given_another_sign_in_sender_or_a_typed_password() {
            MailPasswordRouting routing = runningWithItsPassword();

            assertThat(routing.mayBeTestedThroughAConnection(RUNNING_SERVER, false, RUNNING_SENDER, false)).isFalse();
            assertThat(routing.mayBeTestedThroughAConnection(RUNNING_SERVER, true, "jine@example.cz", false)).isFalse();
            assertThat(routing.mayBeTestedThroughAConnection(RUNNING_SERVER, true, RUNNING_SENDER, true)).isFalse();
        }

        @Test
        @DisplayName("when a test e-mail of the running server has a typed password, then the stored password is not lent")
        void should_lend_nothing_when_tested_given_a_typed_password() {
            assertThat(runningWithItsPassword().lendsTheStoredPasswordTo(RUNNING_SERVER, true)).isFalse();
        }
    }

    @Nested
    @DisplayName("Given a running mail server without a password")
    class GivenARunningServerWithoutAPassword {

        @Test
        @DisplayName("when a change moves the server without a password, then it passes, unless a password is stored for the next start")
        void should_pass_when_moved_given_no_password_runs_or_is_stored() {
            Map<Setting, String> running = runningSettings();
            running.remove(Setting.MAIL_PASSWORD);
            List<SettingChange> move = List.of(new SettingChange(Setting.MAIL_HOST, "smtp.jinde.cz"));

            assertThatNoException().isThrownBy(() -> routing(running).refuseAnotherServerWithoutItsPassword(move, false));
            assertThatThrownBy(() -> routing(running).refuseAnotherServerWithoutItsPassword(move, true))
                    .isInstanceOfSatisfying(SettingsRejected.class, refused -> assertThat(refused.errors())
                            .containsExactly(SettingError.of(Setting.MAIL_PASSWORD, SettingProblem.PASSWORD_FOR_NEW_MAIL_SERVER)));
        }

        @Test
        @DisplayName("when a blank running password is read, then it counts as none")
        void should_count_no_password_when_moved_given_a_blank_running_password() {
            Map<Setting, String> running = runningSettings();
            running.put(Setting.MAIL_PASSWORD, "  ");

            assertThatNoException().isThrownBy(() -> routing(running)
                    .refuseAnotherServerWithoutItsPassword(List.of(new SettingChange(Setting.MAIL_HOST, "smtp.jinde.cz")), false));
        }
    }

    @Nested
    @DisplayName("Given a running server without STARTTLS or sign-in set")
    class GivenNoStartTlsOrSignInSet {

        @Test
        @DisplayName("when a test e-mail names STARTTLS and sign-in off, then they count as the running ones")
        void should_count_both_off_when_tested_given_neither_set() {
            Map<Setting, String> running = runningSettings();
            running.remove(Setting.MAIL_STARTTLS);
            running.remove(Setting.MAIL_AUTH);
            MailServerAddress withoutStartTls = new MailServerAddress("smtp.example.cz", 587, "nadace@example.cz", false);

            assertThat(routing(running).mayBeTestedThroughAConnection(withoutStartTls, false, RUNNING_SENDER, false)).isTrue();
        }
    }

    @Nested
    @DisplayName("Given a running server with a password and no STARTTLS or user set")
    class GivenNoStartTlsOrUserSetWithAPassword {

        @Test
        @DisplayName("when a save names STARTTLS off without a password, then it counts as a move and is refused, unlike the test e-mail, which counts unset STARTTLS as off")
        void should_refuse_when_saved_given_startTls_off_named_against_an_unset_one() {
            Map<Setting, String> running = runningSettings();
            running.remove(Setting.MAIL_STARTTLS);

            assertThatThrownBy(() -> routing(running).refuseAnotherServerWithoutItsPassword(List.of(new SettingChange(Setting.MAIL_STARTTLS, "false")), false))
                    .isInstanceOfSatisfying(SettingsRejected.class, refused -> assertThat(refused.errors())
                            .containsExactly(SettingError.of(Setting.MAIL_PASSWORD, SettingProblem.PASSWORD_FOR_NEW_MAIL_SERVER)));
        }

        @Test
        @DisplayName("when a test e-mail names an empty user, then it counts as the running server without one")
        void should_count_the_running_server_when_tested_given_an_empty_user_and_none_running() {
            Map<Setting, String> running = runningSettings();
            running.remove(Setting.MAIL_USERNAME);

            assertThat(routing(running).lendsTheStoredPasswordTo(new MailServerAddress("smtp.example.cz", 587, "", true), false)).isTrue();
        }
    }
}
