package cz.novanadeje.app.operations.domain.push;

import java.util.Arrays;
import java.util.List;
import java.util.Optional;

public enum PushService {
    GOOGLE(List.of("fcm.googleapis.com"), List.of()),
    APPLE(List.of("web.push.apple.com"), List.of(".push.apple.com")),
    MOZILLA(List.of("updates.push.services.mozilla.com"), List.of(".push.services.mozilla.com")),
    MICROSOFT(List.of(), List.of(".notify.windows.com"));

    private final List<String> hosts;
    private final List<String> domainSuffixes;

    PushService(List<String> hosts, List<String> domainSuffixes) {
        this.hosts = hosts;
        this.domainSuffixes = domainSuffixes;
    }

    public static Optional<PushService> ofHost(String host) {
        return Arrays.stream(values()).filter(service -> service.serves(host)).findFirst();
    }

    private boolean serves(String host) {
        return hosts.contains(host) || domainSuffixes.stream().anyMatch(suffix -> host.endsWith(suffix) && host.length() > suffix.length());
    }
}
