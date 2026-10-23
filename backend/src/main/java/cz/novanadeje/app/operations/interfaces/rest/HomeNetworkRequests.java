package cz.novanadeje.app.operations.interfaces.rest;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Component;

import java.net.Inet6Address;
import java.net.InetAddress;

@Component
class HomeNetworkRequests {

    static final String DIRECT_HEADER = "X-Nfnn-Direct";

    boolean isDirectFromHomeNetwork(HttpServletRequest request) {
        return "1".equals(request.getHeader(DIRECT_HEADER)) && isPrivate(request.getRemoteAddr());
    }

    static boolean isPrivate(String address) {
        if (address == null || address.isBlank()) {
            return false;
        }
        InetAddress parsed;
        try {
            parsed = InetAddress.ofLiteral(address.strip());
        } catch (IllegalArgumentException notLiteral) {
            return false;
        }
        if (parsed.isSiteLocalAddress() || parsed.isLoopbackAddress() || parsed.isLinkLocalAddress()) {
            return true;
        }
        return parsed instanceof Inet6Address && (parsed.getAddress()[0] & 0xfe) == 0xfc;
    }
}
