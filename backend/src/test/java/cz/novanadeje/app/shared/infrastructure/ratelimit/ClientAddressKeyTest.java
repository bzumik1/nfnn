package cz.novanadeje.app.shared.infrastructure.ratelimit;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;

class ClientAddressKeyTest {

    @Test
    @DisplayName("Given an IPv4 address, when it becomes a key, then the key is that address")
    void should_keep_address_when_keyed_given_ipv4() {
        assertThat(new ClientAddressKey("203.0.113.7").value()).isEqualTo("203.0.113.7");
    }

    @Test
    @DisplayName("Given an IPv4 address with surrounding spaces, when it becomes a key, then the key is that address")
    void should_strip_spaces_when_keyed_given_ipv4_with_surrounding_spaces() {
        assertThat(new ClientAddressKey(" 203.0.113.7 ").value()).isEqualTo("203.0.113.7");
    }

    @Test
    @DisplayName("Given two IPv4 addresses, when they become keys, then the keys differ")
    void should_keep_keys_apart_when_keyed_given_two_ipv4_addresses() {
        assertThat(new ClientAddressKey("203.0.113.7")).isNotEqualTo(new ClientAddressKey("203.0.113.8"));
    }

    @ParameterizedTest(name = "{0}")
    @CsvSource({"::ffff:203.0.113.7", "[::ffff:203.0.113.7]", "::FFFF:cb00:7107", "0:0:0:0:0:ffff:203.0.113.7"})
    @DisplayName("Given an IPv4-mapped IPv6 address, when it becomes a key, then the key is the IPv4 address")
    void should_key_by_ipv4_when_keyed_given_ipv4_mapped_address(String mapped) {
        assertThat(new ClientAddressKey(mapped)).isEqualTo(new ClientAddressKey("203.0.113.7"));
    }

    @Test
    @DisplayName("Given two IPv4-mapped addresses, when they become keys, then they do not share one key")
    void should_keep_keys_apart_when_keyed_given_two_ipv4_mapped_addresses() {
        assertThat(new ClientAddressKey("::ffff:203.0.113.7")).isNotEqualTo(new ClientAddressKey("::ffff:203.0.113.8"));
    }

    @ParameterizedTest(name = "{0} and {1}")
    @CsvSource({
            "2001:db8:1:2::a, 2001:db8:1:2::b",
            "[2001:db8:1:2::1], 2001:db8:1:2:ffff:ffff:ffff:ffff",
            "2001:DB8:1:2::1, 2001:0db8:0001:0002:0:0:0:9",
            "fe80::1%eth0, [fe80::2]",
            "[fe80::1%eth0], fe80::2"
    })
    @DisplayName("Given two IPv6 addresses in one /64, when they become keys, then they share one key")
    void should_share_key_when_keyed_given_ipv6_addresses_in_one_slash_64(String first, String second) {
        assertThat(new ClientAddressKey(first)).isEqualTo(new ClientAddressKey(second));
    }

    @Test
    @DisplayName("Given an IPv6 address, when it becomes a key, then the key is its /64 network")
    void should_key_by_network_when_keyed_given_ipv6() {
        assertThat(new ClientAddressKey("[2001:db8:1:2:3:4:5:6]").value()).isEqualTo("2001:db8:1:2:0:0:0:0");
    }

    @Test
    @DisplayName("Given two IPv6 addresses in neighbouring /64 networks, when they become keys, then the keys differ")
    void should_keep_keys_apart_when_keyed_given_ipv6_addresses_in_two_networks() {
        assertThat(new ClientAddressKey("2001:db8:1:2::1")).isNotEqualTo(new ClientAddressKey("2001:db8:1:3::1"));
    }

    @Test
    @DisplayName("Given a key, when its value becomes a key again, then nothing changes")
    void should_keep_key_when_keyed_again_given_normalised_value() {
        ClientAddressKey network = new ClientAddressKey("2001:db8:1:2::a");
        ClientAddressKey ipv4 = new ClientAddressKey("::ffff:203.0.113.7");

        assertThat(new ClientAddressKey(network.value())).isEqualTo(network);
        assertThat(new ClientAddressKey(ipv4.value())).isEqualTo(ipv4);
    }

    @Test
    @DisplayName("Given values that are no IP address, when they become keys, then they share one key that no address has")
    void should_share_one_key_when_keyed_given_values_that_are_no_address() {
        ClientAddressKey unknown = new ClientAddressKey("unknown");

        assertThat(new ClientAddressKey("example.com")).isEqualTo(unknown);
        assertThat(new ClientAddressKey("")).isEqualTo(unknown);
        assertThat(unknown).isNotEqualTo(new ClientAddressKey("0.0.0.0")).isNotEqualTo(new ClientAddressKey("::"));
        assertThat(unknown.isAddress()).isFalse();
        assertThat(new ClientAddressKey("203.0.113.7").isAddress()).isTrue();
        assertThat(new ClientAddressKey("2001:db8::1").isAddress()).isTrue();
    }

    @Test
    @DisplayName("Given no client address at all, when it becomes a key, then it shares the key of values that are no address")
    void should_share_no_address_key_when_keyed_given_no_client_address() {
        assertThat(new ClientAddressKey(null)).isEqualTo(new ClientAddressKey("unknown"));
    }
}
