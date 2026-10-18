package cz.novanadeje.app.donations.infrastructure.bank;

import cz.novanadeje.app.donations.domain.bank.SenderAccount;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class PairingPropertiesTest {

    @Test
    @DisplayName("Given accounts written as number/bank code, when read, then each is excluded in its canonical form and blank entries are ignored")
    void should_exclude_canonical_accounts_when_read_given_number_and_bank_code() {
        PairingProperties properties = new PairingProperties(List.of("2400000002/2010", " 000019-2000145399/0800 ", ""));

        assertThat(properties.toExcludedSenderAccounts().accounts()).containsExactlyInAnyOrder(
                new SenderAccount("2400000002", "2010"), new SenderAccount("19-2000145399", "0800"));
    }

    @Test
    @DisplayName("Given no setting, when read, then nothing is excluded")
    void should_exclude_nothing_when_read_given_no_setting() {
        assertThat(new PairingProperties(null).toExcludedSenderAccounts().accounts()).isEmpty();
    }

    @Test
    @DisplayName("Given an entry that is not a Czech account, when read, then the startup is refused with the entry named")
    void should_refuse_when_read_given_invalid_entry() {
        assertThatIllegalArgumentException().isThrownBy(() -> new PairingProperties(List.of("123")).toExcludedSenderAccounts())
                .withMessageContaining("123");
        assertThatIllegalArgumentException().isThrownBy(() -> new PairingProperties(List.of("abc/2010")).toExcludedSenderAccounts())
                .withMessageContaining("abc/2010");
        assertThatIllegalArgumentException().isThrownBy(() -> new PairingProperties(List.of("2400000002/20")).toExcludedSenderAccounts())
                .withMessageContaining("2400000002/20");
    }
}
