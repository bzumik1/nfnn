package cz.novanadeje.app.donors.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PasskeyUserHandleTest {

    private static final DonorId DONOR = new DonorId(UUID.fromString("0190f5a2-7b3c-7d4e-8f00-112233445566"));

    @Test
    @DisplayName("Given a donor id, when its passkey user handle is made, then it is the 16 bytes of the id in unpadded base64url and matches only itself")
    void should_encode_donor_id_when_made_given_donor_id() {
        PasskeyUserHandle handle = PasskeyUserHandle.of(DONOR);

        assertThat(handle.value()).isEqualTo("AZD1ons8fU6PABEiM0RVZg");
        assertThat(handle.matches("AZD1ons8fU6PABEiM0RVZg")).isTrue();
        assertThat(handle.matches("AZD1ons8fU6PABEiM0RVZw")).isFalse();
        assertThat(handle.matches(null)).isFalse();
    }

    @Test
    @DisplayName("Given a value that is not 16 bytes in unpadded base64url, when a passkey user handle is made of it, then it is refused")
    void should_refuse_when_created_given_value_of_another_shape() {
        assertThatThrownBy(() -> new PasskeyUserHandle(null)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new PasskeyUserHandle("")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new PasskeyUserHandle("AZD1ons8fU6PABEiM0RVZg==")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new PasskeyUserHandle("AZD1ons8fU6PABEiM0RVZ")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new PasskeyUserHandle("AZD1ons8fU6PABEiM0RV+g")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new PasskeyUserHandle("AZD1ons8fU6PABEiM0RVZh")).isInstanceOf(IllegalArgumentException.class);
    }
}
