package cz.novanadeje.app.donors.infrastructure.oauth;

import java.net.Inet4Address;
import java.net.InetAddress;
import java.util.List;

final class PublicAddresses {

    private static final List<Range> NON_PUBLIC_IPV4 = List.of(
            Range.of(0, 0, 0, 0, 8), Range.of(10, 0, 0, 0, 8), Range.of(100, 64, 0, 0, 10), Range.of(127, 0, 0, 0, 8),
            Range.of(169, 254, 0, 0, 16), Range.of(172, 16, 0, 0, 12), Range.of(192, 0, 0, 0, 24), Range.of(192, 0, 2, 0, 24),
            Range.of(192, 168, 0, 0, 16), Range.of(198, 18, 0, 0, 15), Range.of(198, 51, 100, 0, 24), Range.of(203, 0, 113, 0, 24),
            Range.of(224, 0, 0, 0, 4), Range.of(240, 0, 0, 0, 4));
    private static final List<Range> NON_PUBLIC_IPV6 = List.of(
            Range.ipv6(0, 0, 96), Range.ipv6(0x0064, 0xff9b, 32), Range.ipv6(0x0100, 0, 16), Range.ipv6(0x2001, 0, 23),
            Range.ipv6(0x2001, 0x0db8, 32), Range.ipv6(0x2002, 0, 16), Range.ipv6(0xfc00, 0, 7), Range.ipv6(0xfe80, 0, 10),
            Range.ipv6(0xfec0, 0, 10), Range.ipv6(0xff00, 0, 8));

    private PublicAddresses() {
    }

    static boolean isPublic(InetAddress address) {
        byte[] bytes = address.getAddress();
        List<Range> ranges = address instanceof Inet4Address ? NON_PUBLIC_IPV4 : NON_PUBLIC_IPV6;
        return ranges.stream().noneMatch(range -> range.contains(bytes)) && !address.isLoopbackAddress() && !address.isAnyLocalAddress();
    }

    private record Range(byte[] prefix, int bits) {

        static Range of(int a, int b, int c, int d, int bits) {
            return new Range(new byte[]{(byte) a, (byte) b, (byte) c, (byte) d}, bits);
        }

        static Range ipv6(int firstGroup, int secondGroup, int bits) {
            byte[] prefix = new byte[16];
            prefix[0] = (byte) (firstGroup >> 8);
            prefix[1] = (byte) firstGroup;
            prefix[2] = (byte) (secondGroup >> 8);
            prefix[3] = (byte) secondGroup;
            return new Range(prefix, bits);
        }

        boolean contains(byte[] address) {
            if (address.length != prefix.length) {
                return false;
            }
            for (int bit = 0; bit < bits; bit++) {
                int mask = 0x80 >> (bit % 8);
                if ((address[bit / 8] & mask) != (prefix[bit / 8] & mask)) {
                    return false;
                }
            }
            return true;
        }
    }
}
