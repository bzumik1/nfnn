package cz.novanadeje.app.shared.infrastructure.ratelimit;

import java.net.Inet4Address;
import java.net.Inet6Address;
import java.net.InetAddress;
import java.util.Objects;
import java.util.Optional;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

public record ClientAddressKey(String value) {

    private static final String NO_ADDRESS = "no-address";
    private static final int NETWORK_HEXTETS = 4;

    public ClientAddressKey {
        value = normalise(Objects.requireNonNull(value, "clientAddress"));
    }

    public boolean isAddress() {
        return true;
    }

    private static String normalise(String clientAddress) {
        return parse(withoutZone(clientAddress))
                .map(address -> switch (address) {
                    case Inet4Address ipv4 -> ipv4.getHostAddress();
                    case Inet6Address ipv6 -> network(ipv6);
                    default -> NO_ADDRESS;
                })
                .orElse(NO_ADDRESS);
    }

    private static String withoutZone(String clientAddress) {
        int zone = clientAddress.indexOf('%');
        if (zone < 0) {
            return clientAddress;
        }
        return clientAddress.substring(0, zone) + (clientAddress.startsWith("[") ? "]" : "");
    }

    private static Optional<InetAddress> parse(String literal) {
        try {
            return Optional.of(InetAddress.ofLiteral(literal));
        } catch (IllegalArgumentException notAnAddress) {
            return Optional.empty();
        }
    }

    private static String network(Inet6Address address) {
        byte[] bytes = address.getAddress();
        return IntStream.range(0, NETWORK_HEXTETS)
                .mapToObj(hextet -> Integer.toHexString((bytes[2 * hextet] & 0xff) << 8 | bytes[2 * hextet + 1] & 0xff))
                .collect(Collectors.joining(":", "", ":0:0:0:0"));
    }
}
