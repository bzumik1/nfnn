package cz.novanadeje.app.operations.application.push;

import cz.novanadeje.app.operations.domain.push.PushService;

final class PushServiceNames {

    private PushServiceNames() {
    }

    static String of(PushService service) {
        return switch (service) {
            case GOOGLE -> "Google";
            case APPLE -> "Apple";
            case MOZILLA -> "Mozilla";
            case MICROSOFT -> "Microsoft";
        };
    }
}
